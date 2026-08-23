/**
 * Client-side JavaScript for observe (read-only) mode.
 * Handles turn expansion/collapse interactions and theme toggle.
 */

/**
 * Returns the client-side script as an inline string.
 * This script handles turn details expansion and theme cycling in observe mode.
 */
export function observeClientScript(): string {
  return `(function () {
  function initThemeToggle() {
    var toggle = document.getElementById('theme-toggle');
    var label = toggle ? toggle.querySelector('.theme-toggle-label') : null;
    if (!toggle) return;
    
    function getTheme() {
      return localStorage.getItem('dashboard-theme') || 'system';
    }
    
    function setTheme(theme) {
      localStorage.setItem('dashboard-theme', theme);
      applyTheme(theme);
    }
    
    function applyTheme(theme) {
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      updateLabel(theme);
    }
    
    function updateLabel(theme) {
      if (!label) return;
      var labels = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' };
      label.textContent = labels[theme] || 'Tema';
    }
    
    function cycleTheme() {
      var current = getTheme();
      var next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      setTheme(next);
    }
    
    toggle.addEventListener('click', cycleTheme);
    updateLabel(getTheme());
  }
  
  document.querySelectorAll('.turn-header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var turnId = btn.getAttribute('data-turn-id');
      var details = document.querySelector('.turn-details[data-turn-id="' + turnId + '"]');
      var isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      if (details) {
        details.hidden = isExpanded;
      }
    });
  });
  
  initThemeToggle();
})();`;
}
