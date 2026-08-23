/**
 * Client-side JavaScript for chat (interactive) mode.
 * Handles SSE streaming, token authentication, thread management (including deletion),
 * theme toggle, and UI interactions.
 */

/**
 * Returns the client-side script as an inline string.
 * This script handles:
 * - Token-based authentication with session storage
 * - SSE-based streaming chat
 * - Thread management (create, load, list, delete)
 * - Turn expansion and replay
 * - Markdown rendering via /api/markdown
 * - Confirmation flow for force-required operations
 * - Dark mode theme toggle (system/light/dark cycling)
 */
export function chatClientScript(): string {
  return `(function () {
  var TOKEN_KEY = 'dashboardToken';
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var log = document.getElementById('chat-log');
  var empty = document.getElementById('chat-empty');
  var sendBtn = document.getElementById('chat-send');
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var threadIndicator = document.getElementById('chat-thread-indicator');
  if (!form || !input || !log || !sendBtn) return;

  var currentContext = null;
  var currentThreadId = localStorage.getItem('currentThreadId') || null;
  var currentThreadTitle = null;

  function updateThreadIndicator() {
    if (!threadIndicator) return;
    if (currentThreadId && currentThreadTitle) {
      threadIndicator.textContent = currentThreadTitle;
    } else if (currentThreadId) {
      threadIndicator.textContent = 'Hilo activo (sin título)';
    } else {
      threadIndicator.textContent = 'Sin hilo activo';
    }
  }

  function switchToThreadsPanel() {
    document.querySelectorAll('.side-tab').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-panel') === 'threads');
    });
    document.querySelectorAll('.side-panel').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-panel') === 'threads');
    });
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function showUnlockModal(isRetry) {
    var existingModal = document.getElementById('unlock-modal');
    if (existingModal) return;
    
    var overlay = document.createElement('div');
    overlay.id = 'unlock-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--modal-overlay);display:flex;align-items:center;justify-content:center;z-index:999;animation:fadeIn 200ms ease;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);padding:1.5rem;border-radius:1rem;max-width:24rem;width:90%;box-shadow:0 20px 60px var(--modal-shadow);animation:slideUp 250ms ease;';
    
    var title = document.createElement('h2');
    title.textContent = isRetry ? 'Token incorrecto' : 'Dashboard protegido';
    title.style.cssText = 'margin:0 0 0.5rem;font-size:1.2rem;color:var(--ink);';
    
    var desc = document.createElement('p');
    desc.textContent = isRetry ? 'El token ingresado no es válido. Por favor verifica e intenta de nuevo.' : 'Ingresa el token de autenticación desde tu archivo .env para acceder al chat.';
    desc.style.cssText = 'margin:0 0 1rem;color:var(--muted);font-size:0.9rem;line-height:1.5;';
    
    var inputField = document.createElement('input');
    inputField.type = 'password';
    inputField.placeholder = 'DASHBOARD_TOKEN';
    inputField.style.cssText = 'width:100%;padding:0.65rem 0.85rem;font:inherit;font-size:0.95rem;border:1px solid var(--line);border-radius:0.6rem;margin-bottom:1rem;background:var(--panel);';
    
    var btn = document.createElement('button');
    btn.textContent = 'Desbloquear';
    btn.style.cssText = 'width:100%;padding:0.65rem;font:inherit;font-weight:600;border:none;border-radius:0.6rem;background:var(--accent);color:var(--button-text);cursor:pointer;';
    
    var error = document.createElement('p');
    error.style.cssText = 'margin:0.75rem 0 0;color:var(--error-text);font-size:0.85rem;display:none;';
    
    btn.addEventListener('click', function () {
      var token = inputField.value.trim();
      if (!token) {
        error.textContent = 'El token no puede estar vacío';
        error.style.display = 'block';
        return;
      }
      setToken(token);
      document.body.removeChild(overlay);
      if (isRetry) {
        location.reload();
      }
    });
    
    inputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });
    
    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(inputField);
    modal.appendChild(btn);
    modal.appendChild(error);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    inputField.focus();
  }

  function fetchWithToken(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.credentials = 'include';
    var token = getToken();
    if (token) {
      options.headers['X-Dashboard-Token'] = token;
    }
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        clearToken();
        showUnlockModal(true);
        throw new Error('Unauthorized');
      }
      return res;
    });
  }

  document.querySelectorAll('.side-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var panel = tab.getAttribute('data-panel');
      document.querySelectorAll('.side-tab').forEach(function (el) {
        el.classList.toggle('is-active', el === tab);
      });
      document.querySelectorAll('.side-panel').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-panel') === panel);
      });
    });
  });

  document.querySelectorAll('.turn-header').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      var turnId = btn.getAttribute('data-turn-id');
      var turnItem = btn.closest('.turn-item');
      
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        var details = document.querySelector('.turn-details[data-turn-id="' + turnId + '"]');
        var isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        if (details) {
          details.hidden = isExpanded;
        }
        return;
      }
      
      if (turnItem) {
        var turnPrompt = turnItem.getAttribute('data-turn-prompt');
        var turnReply = turnItem.getAttribute('data-turn-reply');
        if (turnPrompt) {
          hideEmpty();
          log.innerHTML = '';
          currentContext = { userPrompt: turnPrompt, assistantReply: turnReply || '' };
          appendBubble('user', turnPrompt, false);
          if (turnReply) {
            fetchWithToken('/api/markdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: turnReply })
            }).then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            }).then(function (data) {
              appendBubble('assistant', data.markdown || turnReply, true);
            }).catch(function () {
              appendBubble('assistant', turnReply, false);
            });
          } else {
            var noReplyEl = appendBubble('assistant', 'sin respuesta guardada', false);
            noReplyEl.style.fontStyle = 'italic';
            noReplyEl.style.color = 'var(--muted)';
          }
        }
      }
    });
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('sidebar-open');
      sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  
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

  function hideEmpty() {
    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
  }

  function appendBubble(role, text, isMarkdown) {
    hideEmpty();
    var row = document.createElement('div');
    row.className = 'chat-row ' + role;
    var el = document.createElement('div');
    el.className = 'chat-bubble ' + role;
    if (isMarkdown && role === 'assistant') {
      el.innerHTML = text;
    } else {
      el.textContent = text;
    }
    row.appendChild(el);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 144) + 'px';
  }
  input.addEventListener('input', autosize);

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var prompt = (input.value || '').trim();
    if (!prompt) return;
    input.value = '';
    autosize();
    appendBubble('user', prompt);
    var assistantEl = appendBubble('assistant', '');
    assistantEl.classList.add('streaming');
    sendBtn.disabled = true;
    input.disabled = true;

    var body = { prompt: prompt };
    if (currentThreadId) {
      body.threadId = currentThreadId;
    } else if (currentContext) {
      body.context = currentContext;
    }

    fetchWithToken('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error((body && body.message) || ('HTTP ' + res.status));
        }).catch(function (err) {
          if (err instanceof Error && err.message.indexOf('HTTP') === 0) throw err;
          throw new Error('HTTP ' + res.status);
        });
      }
      if (!res.body) throw new Error('No response body');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });
          var parts = buffer.split('\\n\\n');
          buffer = parts.pop() || '';
          for (var i = 0; i < parts.length; i++) {
            var block = parts[i];
            var lines = block.split('\\n');
            for (var j = 0; j < lines.length; j++) {
              var line = lines[j];
              if (line.indexOf('data: ') !== 0) continue;
              var payload;
              try { payload = JSON.parse(line.slice(6)); } catch (e) { continue; }
              if (payload.type === 'delta' && typeof payload.text === 'string') {
                assistantEl.setAttribute('data-raw', (assistantEl.getAttribute('data-raw') || '') + payload.text);
                assistantEl.textContent = assistantEl.getAttribute('data-raw') || '';
                log.scrollTop = log.scrollHeight;
              } else if (payload.type === 'error' && typeof payload.message === 'string') {
                assistantEl.className = 'chat-bubble error';
                assistantEl.textContent = payload.message;
                currentContext = null;
              } else if (payload.type === 'done' && typeof payload.reply === 'string') {
                var finalText = payload.reply;
                if (payload.markdown && typeof payload.markdown === 'string') {
                  assistantEl.innerHTML = payload.markdown;
                } else {
                  assistantEl.textContent = finalText;
                }
                
                if (payload.requiresForceConfirmation === true) {
                  var actions = document.createElement('div');
                  actions.className = 'confirm-actions';
                  
                  var okBtn = document.createElement('button');
                  okBtn.className = 'confirm-btn ok';
                  okBtn.textContent = 'Confirmar';
                  
                  var noBtn = document.createElement('button');
                  noBtn.className = 'confirm-btn no';
                  noBtn.textContent = 'Cancelar';
                  
                  function handleConfirm(action) {
                    okBtn.disabled = true;
                    noBtn.disabled = true;
                    
                    var newAssistantEl = appendBubble('assistant', '');
                    newAssistantEl.classList.add('streaming');
                    sendBtn.disabled = true;
                    input.disabled = true;
                    
                    fetchWithToken('/api/confirm', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                      body: JSON.stringify({ action: action })
                    }).then(function (res) {
                      if (!res.ok) throw new Error('HTTP ' + res.status);
                      if (!res.body) throw new Error('No response body');
                      var reader = res.body.getReader();
                      var decoder = new TextDecoder();
                      var buffer = '';
                      function pumpConfirm() {
                        return reader.read().then(function (result) {
                          if (result.done) return;
                          buffer += decoder.decode(result.value, { stream: true });
                          var parts = buffer.split('\\n\\n');
                          buffer = parts.pop() || '';
                          for (var i = 0; i < parts.length; i++) {
                            var block = parts[i];
                            var lines = block.split('\\n');
                            for (var j = 0; j < lines.length; j++) {
                              var line = lines[j];
                              if (line.indexOf('data: ') !== 0) continue;
                              var payload;
                              try { payload = JSON.parse(line.slice(6)); } catch (e) { continue; }
                              if (payload.type === 'delta' && typeof payload.text === 'string') {
                                newAssistantEl.setAttribute('data-raw', (newAssistantEl.getAttribute('data-raw') || '') + payload.text);
                                newAssistantEl.textContent = newAssistantEl.getAttribute('data-raw') || '';
                                log.scrollTop = log.scrollHeight;
                              } else if (payload.type === 'error' && typeof payload.message === 'string') {
                                newAssistantEl.className = 'chat-bubble error';
                                newAssistantEl.textContent = payload.message;
                              } else if (payload.type === 'done') {
                                if (payload.markdown && typeof payload.markdown === 'string') {
                                  newAssistantEl.innerHTML = payload.markdown;
                                } else if (typeof payload.reply === 'string') {
                                  newAssistantEl.textContent = payload.reply;
                                }
                              }
                            }
                          }
                          return pumpConfirm();
                        });
                      }
                      return pumpConfirm();
                    }).catch(function (err) {
                      newAssistantEl.classList.remove('streaming');
                      newAssistantEl.className = 'chat-bubble error';
                      newAssistantEl.textContent = err && err.message ? err.message : String(err);
                    }).then(function () {
                      newAssistantEl.classList.remove('streaming');
                      sendBtn.disabled = false;
                      input.disabled = false;
                      input.focus();
                    });
                  }
                  
                  okBtn.addEventListener('click', function () { handleConfirm('ok'); });
                  noBtn.addEventListener('click', function () { handleConfirm('no'); });
                  
                  actions.appendChild(okBtn);
                  actions.appendChild(noBtn);
                  assistantEl.parentNode.appendChild(actions);
                }
                
                if (payload.threadId) {
                  currentThreadId = payload.threadId;
                  localStorage.setItem('currentThreadId', currentThreadId);
                  switchToThreadsPanel();
                  loadThreads();
                } else {
                  currentContext = { userPrompt: prompt, assistantReply: finalText };
                }
              }
            }
          }
          return pump();
        }).catch(function () {
          throw new Error('Stream ended without done or error');
        });
      }
      return pump();
    }).catch(function (err) {
      assistantEl.classList.remove('streaming');
      assistantEl.className = 'chat-bubble error';
      assistantEl.textContent = err && err.message ? err.message : String(err);
      currentContext = null;
    }).then(function () {
      assistantEl.classList.remove('streaming');
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    });
  });

  function loadThreads() {
    fetchWithToken('/api/threads')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var panel = document.getElementById('threads-list-panel');
        if (!panel) return;
        if (!data.threads || data.threads.length === 0) {
          panel.innerHTML = '<p style="padding:8px;color:var(--muted);font-size:0.9em;">Sin hilos todavía</p>';
          return;
        }
        var html = '<div class="thread-list">';
        data.threads.forEach(function (t) {
          var active = currentThreadId === t.id ? ' is-active' : '';
          var title = t.title || 'Sin título';
          if (title.length > 50) title = title.slice(0, 47) + '...';
          var msgCount = t.messageCount || 0;
          var dateStr = new Date(t.updatedAt).toLocaleString();
          html += '<div class="thread-item' + active + '" data-thread-id="' + t.id + '">' +
                  '<div class="thread-content">' +
                  '<div class="thread-title">' + title + '</div>' +
                  '<div class="thread-meta">' + msgCount + ' msgs · ' + dateStr + '</div>' +
                  '</div>' +
                  '<div class="thread-actions">' +
                  '<button class="thread-rename-btn" data-thread-id="' + t.id + '" title="Renombrar hilo">✎</button>' +
                  '<button class="thread-delete-btn" data-thread-id="' + t.id + '" title="Borrar hilo">✕</button>' +
                  '</div>' +
                  '</div>';
        });
        html += '</div>';
        panel.innerHTML = html;
        
        panel.querySelectorAll('.thread-item').forEach(function (item) {
          var threadId = item.getAttribute('data-thread-id');
          var deleteBtn = item.querySelector('.thread-delete-btn');
          var renameBtn = item.querySelector('.thread-rename-btn');
          
          item.addEventListener('click', function (e) {
            if (e.target === deleteBtn || deleteBtn.contains(e.target) ||
                e.target === renameBtn || renameBtn.contains(e.target)) {
              return;
            }
            loadThread(threadId);
          });
          
          if (renameBtn) {
            renameBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              var newTitle = prompt('Nuevo título:');
              if (newTitle && newTitle.trim()) {
                renameThreadById(threadId, newTitle.trim());
              }
            });
          }
          
          if (deleteBtn) {
            deleteBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              if (confirm('¿Borrar este hilo?')) {
                deleteThread(threadId);
              }
            });
          }
        });
      })
      .catch(function (err) {
        console.error('Failed to load threads:', err);
      });
  }

  function renameThreadById(threadId, newTitle) {
    fetchWithToken('/api/threads/' + threadId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function () {
        if (currentThreadId === threadId) {
          currentThreadTitle = newTitle;
          updateThreadIndicator();
        }
        loadThreads();
      })
      .catch(function (err) {
        alert('Error al renombrar el hilo: ' + (err.message || String(err)));
        console.error('Failed to rename thread:', err);
      });
  }

  function deleteThread(threadId) {
    fetchWithToken('/api/threads/' + threadId, { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function () {
        if (currentThreadId === threadId) {
          currentThreadId = null;
          currentThreadTitle = null;
          currentContext = null;
          localStorage.removeItem('currentThreadId');
          log.innerHTML = '';
          if (empty && !empty.parentNode) {
            log.appendChild(empty);
          }
          updateThreadIndicator();
        }
        loadThreads();
      })
      .catch(function (err) {
        alert('Error al borrar el hilo: ' + (err.message || String(err)));
        console.error('Failed to delete thread:', err);
      });
  }

  function loadThread(threadId) {
    fetchWithToken('/api/threads/' + threadId)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.thread) return;
        currentThreadId = threadId;
        currentThreadTitle = data.thread.title || 'Sin título';
        localStorage.setItem('currentThreadId', threadId);
        currentContext = null;
        log.innerHTML = '';
        hideEmpty();
        updateThreadIndicator();
        
        data.thread.messages.forEach(function (msg) {
          if (msg.role === 'assistant') {
            fetchWithToken('/api/markdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: msg.content })
            }).then(function (res) { return res.json(); })
              .then(function (mdData) {
                appendBubble('assistant', mdData.markdown || msg.content, true);
              })
              .catch(function () {
                appendBubble('assistant', msg.content, false);
              });
          } else {
            appendBubble('user', msg.content, false);
          }
        });
        
        loadThreads();
      })
      .catch(function (err) {
        console.error('Failed to load thread:', err);
      });
  }

  function startNewThread() {
    currentThreadId = null;
    currentThreadTitle = null;
    currentContext = null;
    localStorage.removeItem('currentThreadId');
    log.innerHTML = '';
    if (empty && !empty.parentNode) {
      log.appendChild(empty);
    }
    updateThreadIndicator();
    loadThreads();
    input.focus();
  }

  var newThreadBtnHeader = document.getElementById('new-thread-btn-header');
  var newThreadBtnSidebar = document.getElementById('new-thread-btn-sidebar');
  if (newThreadBtnHeader) {
    newThreadBtnHeader.addEventListener('click', startNewThread);
  }
  if (newThreadBtnSidebar) {
    newThreadBtnSidebar.addEventListener('click', startNewThread);
  }

  initThemeToggle();
  loadThreads();
  updateThreadIndicator();
})();`;
}
