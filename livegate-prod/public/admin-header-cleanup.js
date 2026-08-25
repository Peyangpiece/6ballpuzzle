/* Live Gate Admin header cleanup */
(function(){
  if(typeof adminTop !== 'function') return;

  // Global Admin header should only contain persistent global actions.
  // Context-specific actions (event creation, date/range filters) live inside each page.
  adminTop = function(title){
    return `<header class="admin-top"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn mobile-menu-btn" onclick="document.querySelector('#adminSide').classList.toggle('open')">☰</button><h1>${title}</h1></div><div class="admin-tools"><button class="icon-btn" aria-label="管理者通知" onclick="toast('管理者通知はありません')">◌</button></div></header>`;
  };

  document.documentElement.dataset.adminHeader = 'contextual-v1';
})();
