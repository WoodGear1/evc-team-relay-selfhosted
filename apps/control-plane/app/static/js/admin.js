// Admin Panel JavaScript

const THEME_STORAGE_KEY = 'theme-mode';
const THEME_ATTRIBUTE = 'data-theme';
const THEME_MODE_ATTRIBUTE = 'data-theme-mode';

function getStoredThemeMode() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function resolveTheme(themeMode) {
  if (themeMode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return themeMode;
}

function applyTheme(themeMode, persist = false) {
  const resolvedTheme = resolveTheme(themeMode);
  const root = document.documentElement;

  root.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
  root.setAttribute(THEME_MODE_ATTRIBUTE, themeMode);
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }

  const select = document.getElementById('theme-select');
  if (select) {
    select.value = themeMode;
  }
}

// Confirmation dialogs for destructive actions
function confirmAction(message, callback) {
  if (confirm(message)) {
    callback();
  }
}

// Delete user with confirmation
function deleteUser(userId, email) {
  confirmAction(
    `Are you sure you want to delete user "${email}"? This action cannot be undone.`,
    () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/admin-ui/users/${userId}/delete`;
      document.body.appendChild(form);
      form.submit();
    }
  );
}

// Toggle admin role with confirmation
function toggleAdmin(userId, email, isAdmin) {
  const action = isAdmin ? 'revoke admin privileges from' : 'grant admin privileges to';
  confirmAction(
    `Are you sure you want to ${action} user "${email}"?`,
    () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/admin-ui/users/${userId}/toggle-admin`;
      document.body.appendChild(form);
      form.submit();
    }
  );
}

// Toggle active status with confirmation
function toggleActive(userId, email, isActive) {
  const action = isActive ? 'deactivate' : 'activate';
  confirmAction(
    `Are you sure you want to ${action} user "${email}"?`,
    () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/admin-ui/users/${userId}/toggle-active`;
      document.body.appendChild(form);
      form.submit();
    }
  );
}

// Auto-hide alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
  const themeSelect = document.getElementById('theme-select');
  const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  applyTheme(getStoredThemeMode());

  if (themeSelect) {
    themeSelect.value = getStoredThemeMode();
    themeSelect.addEventListener('change', (event) => {
      applyTheme(event.target.value, true);
    });
  }

  themeMediaQuery.addEventListener('change', () => {
    if (getStoredThemeMode() === 'system') {
      applyTheme('system');
    }
  });

  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });

  // Form validation
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      const password = form.querySelector('input[name="password"]');
      const email = form.querySelector('input[name="email"]');

      if (password && password.value.length > 0 && password.value.length < 8) {
        e.preventDefault();
        alert('Password must be at least 8 characters long');
        return false;
      }

      if (email && !email.value.includes('@')) {
        e.preventDefault();
        alert('Please enter a valid email address');
        return false;
      }
    });
  });

  // Search functionality
  const searchInput = document.querySelector('#user-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach(row => {
        const email = row.querySelector('td:first-child')?.textContent.toLowerCase();
        if (email && email.includes(query)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }
});
