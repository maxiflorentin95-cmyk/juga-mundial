// JUGA Mundial 2026 – JS global

// Activar tooltips de Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltips.forEach(el => new bootstrap.Tooltip(el));
});
