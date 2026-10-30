/** Optional presentation adapter for the Mattermost 11.10 message markup.
 * The attachment hook remains the lifecycle owner; no page-wide scanning.
 * Never changes text or moves host nodes. Unknown layouts keep the footer.
 */
export function mountInline(
  anchor: HTMLElement,
  postId: string,
  changed: () => void,
) {
  const container = document.createElement("span");
  container.className = "mmseen-inline";
  let scope: HTMLElement | null = anchor.parentElement;
  const ids = [`postMessageText_${postId}`, `rhsPostMessageText_${postId}`];
  // Pluggable may add a wrapper. Search only the nearest local ancestor
  // containing this exact post, never the document or another post instance.
  let message: HTMLElement | undefined;
  for (
    let depth = 0;
    scope && depth < 4;
    depth++, scope = scope.parentElement
  ) {
    message = Array.from(
      scope.querySelectorAll<HTMLElement>(".post-message__text"),
    ).find((el) => ids.includes(el.id));
    if (message) break;
  }
  if (!scope || !message) return { container, dispose: () => {} };
  const localScope = scope;
  const place = () => {
    const text = Array.from(
      localScope.querySelectorAll<HTMLElement>(".post-message__text"),
    ).find((el) => ids.includes(el.id));
    // Only a final plain paragraph (or unformatted span). Complex final
    // blocks, tables and code retain the official attachment position.
    const last = text?.lastElementChild;
    const target =
      last instanceof HTMLElement && /^(P|SPAN)$/.test(last.tagName)
        ? last
        : null;
    const inline = Boolean(target);
    // React can keep the paragraph while replacing its own children around
    // our portal. Restore the trailing position even when the parent is unchanged.
    if (target && target.lastChild !== container) target.appendChild(container);
    if (!target && container.parentElement !== anchor)
      anchor.appendChild(container);
    anchor.classList.toggle("mmseen-anchor-inline", inline);
    changed();
  };
  place();
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !container.contains(record.target) &&
          [
            ...Array.from(record.addedNodes),
            ...Array.from(record.removedNodes),
          ].some((node) => node !== container),
      )
    )
      place();
  });
  observer.observe(localScope, { childList: true, subtree: true });
  return {
    container,
    dispose: () => {
      observer.disconnect();
      container.remove();
      anchor.classList.remove("mmseen-anchor-inline");
    },
  };
}
