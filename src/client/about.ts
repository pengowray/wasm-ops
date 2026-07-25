/**
 * The About dialog: the introduction, the reference links and the credits.
 *
 * All of it used to sit on the page — a screen of prose above the chart and an
 * accordion below it. It is worth having and worth reading once, which is not
 * the same as being worth the top of every visit, so it moved behind a button.
 *
 * Wired separately from the chart, so the dialog still opens on a page where
 * the chart failed to start.
 */

const OPEN = '.about-open';
const HASH = '#about';

export function initAbout(): void {
  const dialog = document.getElementById('about') as HTMLDialogElement | null;
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const open = () => {
    if (!dialog.open) dialog.showModal();
  };

  for (const button of document.querySelectorAll<HTMLElement>(OPEN)) {
    button.addEventListener('click', open);
  }
  dialog.querySelector('.about-close')?.addEventListener('click', () => dialog.close());

  /*
   * Clicking outside closes it. A modal dialog's backdrop is not an element,
   * so the click lands on the dialog itself; comparing against its box tells
   * the two apart — anything outside the box was a click on the backdrop.
   */
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });

  // Linkable, so "read the about page" can be a URL. The hash is otherwise an
  // opcode id, and no opcode is called `about`.
  if (location.hash === HASH) open();
  window.addEventListener('hashchange', () => {
    if (location.hash === HASH) open();
  });
}
