#!/usr/bin/env node
/**
 * Puts animation clips from other GLBs of the same rig onto one rigged model (docs/ASSET_PIPELINE.md, Benny).
 *
 *   npm run assets:merge-clips -- <rigged.glb> <output.glb> <clip.glb>:<source clip>=<new name> ...
 *
 * Meshy delivers a rigged character and each animation as separate GLBs, each with the whole mesh again. This keeps the
 * rigged model's mesh, drops its own clips (a one-frame bind pose), and copies every listed clip onto it under the new
 * name, matching joints by node name, so the game downloads the mesh once and every clip with it. A channel whose
 * joint the model does not have is an error: the rigs differ.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

/** Parses `<file>:<source clip>=<new name>`. */
export function parseClipSpec(spec) {
    const match = /^(.+\.glb):(.+)=([A-Za-z][\w-]*)$/.exec(spec);
    if (!match) {
        throw new Error(`expected <file.glb>:<source clip>=<new name>, got "${spec}"`);
    }
    return { file: match[1], source: match[2], name: match[3] };
}

/**
 * Copies clip `source` of `from` onto `into` as `name`, retargeting every channel to the node of the same name. Returns
 * the number of channels copied.
 */
export function copyClip(into, from, source, name) {
    const clip = from
        .getRoot()
        .listAnimations()
        .find((a) => a.getName() === source);
    if (!clip) {
        const have = from
            .getRoot()
            .listAnimations()
            .map((a) => a.getName());
        throw new Error(`no clip "${source}" (have: ${have.join(', ')})`);
    }
    const nodes = new Map(
        into
            .getRoot()
            .listNodes()
            .map((n) => [n.getName(), n])
    );
    const buffer = into.getRoot().listBuffers()[0] ?? into.createBuffer();
    const animation = into.createAnimation(name);
    const samplers = new Map();
    for (const channel of clip.listChannels()) {
        const target = nodes.get(channel.getTargetNode()?.getName() ?? '');
        if (!target) {
            throw new Error(`clip "${source}" moves "${channel.getTargetNode()?.getName()}", which the model lacks`);
        }
        const from = channel.getSampler();
        let sampler = samplers.get(from);
        if (!sampler) {
            const input = into
                .createAccessor()
                .setType(from.getInput().getType())
                .setArray(from.getInput().getArray().slice())
                .setBuffer(buffer);
            const output = into
                .createAccessor()
                .setType(from.getOutput().getType())
                .setArray(from.getOutput().getArray().slice())
                .setBuffer(buffer);
            sampler = into
                .createAnimationSampler()
                .setInput(input)
                .setOutput(output)
                .setInterpolation(from.getInterpolation());
            animation.addSampler(sampler);
            samplers.set(from, sampler);
        }
        animation.addChannel(
            into
                .createAnimationChannel()
                .setTargetNode(target)
                .setTargetPath(channel.getTargetPath())
                .setSampler(sampler)
        );
    }
    return clip.listChannels().length;
}

export async function main(argv) {
    const [model, output, ...specs] = argv;
    if (!model || !output || specs.length === 0) {
        console.error(
            'Usage: npm run assets:merge-clips -- <rigged.glb> <output.glb> <clip.glb>:<source clip>=<new name> ...'
        );
        return 1;
    }
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.read(model);
    for (const animation of document.getRoot().listAnimations()) {
        animation.dispose();
    }
    for (const spec of specs.map(parseClipSpec)) {
        const channels = copyClip(document, await io.read(spec.file), spec.source, spec.name);
        console.log(
            `clip  ${spec.name.padEnd(8)} <- ${path.basename(spec.file)} "${spec.source}" (${channels} channels)`
        );
    }
    await document.transform(prune());
    await mkdir(path.dirname(output), { recursive: true });
    await io.write(output, document);
    console.log(`wrote ${output}`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
