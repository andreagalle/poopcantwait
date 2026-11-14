import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

import { copyClip, parseClipSpec } from './merge-clips.mjs';

/** Two joints named like a rig, and optionally a clip that turns the second one. */
function rig(withClip) {
    const document = new Document();
    const buffer = document.createBuffer();
    const hips = document.createNode('Hips');
    const spine = document.createNode('Spine');
    hips.addChild(spine);
    document.createScene().addChild(hips);
    if (withClip) {
        const input = document
            .createAccessor()
            .setType('SCALAR')
            .setArray(new Float32Array([0, 1]))
            .setBuffer(buffer);
        const output = document
            .createAccessor()
            .setType('VEC4')
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]))
            .setBuffer(buffer);
        const sampler = document.createAnimationSampler().setInput(input).setOutput(output);
        document
            .createAnimation('walking_man')
            .addSampler(sampler)
            .addChannel(
                document.createAnimationChannel().setTargetNode(spine).setTargetPath('rotation').setSampler(sampler)
            );
    }
    return document;
}

describe('assets:merge-clips', () => {
    it('reads a clip spec', () => {
        expect(parseClipSpec('a/walking.glb:Armature|walking_man|baselayer=walk')).toEqual({
            file: 'a/walking.glb',
            source: 'Armature|walking_man|baselayer',
            name: 'walk'
        });
        expect(() => parseClipSpec('walking.glb=walk')).toThrow(/expected/);
    });

    it('copies a clip onto the model, aimed at its own joints by name', () => {
        const model = rig(false);
        const clips = rig(true);
        expect(copyClip(model, clips, 'walking_man', 'walk')).toBe(1);
        const [animation] = model.getRoot().listAnimations();
        expect(animation.getName()).toBe('walk');
        const [channel] = animation.listChannels();
        expect(channel.getTargetNode()).toBe(
            model
                .getRoot()
                .listNodes()
                .find((n) => n.getName() === 'Spine')
        );
        expect(Array.from(channel.getSampler().getOutput().getArray())).toEqual(
            Array.from(clips.getRoot().listAnimations()[0].listSamplers()[0].getOutput().getArray())
        );
    });

    it('refuses a clip it cannot find, or one for another rig', () => {
        expect(() => copyClip(rig(false), rig(true), 'running', 'run')).toThrow(/no clip "running"/);
        const other = rig(true);
        other.getRoot().listNodes()[1].setName('Chest');
        expect(() => copyClip(rig(false), other, 'walking_man', 'walk')).toThrow(/"Chest", which the model lacks/);
    });
});
