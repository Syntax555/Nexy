export function Brand() {
  return (
    <a class="brand" href={import.meta.env.BASE_URL} aria-label="Nexy Battle Lab home">
      <span class="brand__mark" aria-hidden="true">N</span>
      <span class="brand__copy">
        <strong>Nexy</strong>
        <small>Battle Lab</small>
      </span>
    </a>
  );
}
