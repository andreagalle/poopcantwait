/** A short "Phew!" when Benny makes it to a toilet, above the HUD score. */
export function showRelief(parent: HTMLElement): void {
    const pop = document.createElement('p');
    pop.className = 'relief-pop';
    pop.textContent = 'Phew!';
    parent.append(pop);
    pop.addEventListener('animationend', () => pop.remove());
}
