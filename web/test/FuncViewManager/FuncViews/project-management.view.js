(function () {
  'use strict';

  function escHtml(text) {
    if (text == null) return '';
    var el = document.createElement('div');
    el.textContent = String(text);
    return el.innerHTML;
  }

  function summarizeQuestion(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '空题目';
    return text.length > 88 ? text.slice(0, 88) + '...' : text;
  }

  function formatTime(ts) {
    if (!ts) return '无记录';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '无记录';
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return mm + '-' + dd + ' ' + hh + ':' + mi;
    } catch (e) {
      return '无记录';
    }
  }

  function parseJsonArrayText(raw) {
    var data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('JSON 必须是字符串数组');
    var items = [];
    data.forEach(function (item, idx) {
      if (typeof item !== 'string') throw new Error('第 ' + (idx + 1) + ' 项不是字符串');
      var value = item.trim();
      if (!value) throw new Error('第 ' + (idx + 1) + ' 项为空字符串');
      items.push(value);
    });
    if (!items.length) throw new Error('JSON 数组不能为空');
    return items;
  }

  function calcProgress(questions) {
    var total = (questions || []).length;
    var done = (questions || []).filter(function (q) { return q.status === 'done'; }).length;
    return {
      total: total,
      done: done,
      ratio: total ? Math.max(0, Math.min(1, done / total)) : 0,
    };
  }

  function byCreatedDesc(a, b) {
    return String(b.completed_at || b.created_at || '').localeCompare(String(a.completed_at || a.created_at || ''));
  }

  function joinDefined(parts, fallback, separator) {
    var values = (parts || []).filter(function (part) {
      return part != null && String(part).trim() !== '' && String(part).trim().toLowerCase() !== 'undefined';
    }).map(function (part) {
      return String(part).trim();
    });
    return values.length ? values.join(separator || ' / ') : (fallback || '');
  }

  function createDialogMarkup(state) {
    if (!state.dialog) return '';
    var dialog = state.dialog;
    if (dialog.type === 'json-import') {
      var preview = '';
      if (dialog.previewError) {
        preview = '<div class="pm-import-preview pm-import-error">' + escHtml(dialog.previewError) + '</div>';
      } else if (dialog.previewItems && dialog.previewItems.length) {
        preview = ''
          + '<div class="pm-import-preview">'
          + '  <div class="pm-import-kpi"><strong>将追加 ' + dialog.previewItems.length + ' 题</strong></div>'
          + '  <div class="pm-import-line">首题：' + escHtml(summarizeQuestion(dialog.previewItems[0])) + '</div>'
          + '  <div class="pm-import-line">末题：' + escHtml(summarizeQuestion(dialog.previewItems[dialog.previewItems.length - 1])) + '</div>'
          + '</div>';
      }
      return ''
        + '<div class="pm-dialog-overlay" data-dialog-overlay="1">'
        + '  <div class="pm-dialog" data-dialog-box="1">'
        + '    <div class="pm-dialog-head">'
        + '      <div>'
        + '        <div class="pm-dialog-title">追加 JSON 题目</div>'
        + '        <div class="pm-help">仅支持字符串数组，导入后自动 append 到当前题组末尾。</div>'
        + '      </div>'
        + '      <button class="pm-dialog-close" data-close-dialog="1">×</button>'
        + '    </div>'
        + '    <div class="pm-dialog-body">'
        + '      <div class="pm-field">'
        + '        <div class="pm-label">题目 JSON</div>'
        + '        <textarea class="pm-textarea" data-json-input="1" placeholder="[&quot;求极限...&quot;, &quot;计算导数...&quot;]">' + escHtml(dialog.raw || '') + '</textarea>'
        + '      </div>'
        + '      <div class="pm-help">导入行为：只追加，不覆盖已有题目。题号由系统自动顺延。</div>'
        +        preview
        + '    </div>'
        + '    <div class="pm-dialog-actions">'
        + '      <button class="pm-btn ghost" data-close-dialog="1">取消</button>'
        + '      <button class="pm-btn" data-preview-json="1">预览</button>'
        + '      <button class="pm-btn primary" data-submit-json="1">确认导入</button>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    }

    if (dialog.type === 'text-edit') {
      return ''
        + '<div class="pm-dialog-overlay" data-dialog-overlay="1">'
        + '  <div class="pm-dialog" data-dialog-box="1">'
        + '    <div class="pm-dialog-head">'
        + '      <div>'
        + '        <div class="pm-dialog-title">' + escHtml(dialog.title || '编辑') + '</div>'
        + '        <div class="pm-help">' + escHtml(dialog.help || '') + '</div>'
        + '      </div>'
        + '      <button class="pm-dialog-close" data-close-dialog="1">×</button>'
        + '    </div>'
        + '    <div class="pm-dialog-body">'
        + '      <div class="pm-field">'
        + '        <div class="pm-label">' + escHtml(dialog.label || '内容') + '</div>'
        + '        ' + (dialog.multiline
              ? '<textarea class="pm-textarea" data-text-input="1">' + escHtml(dialog.value || '') + '</textarea>'
              : '<input class="pm-input" data-text-input="1" value="' + escHtml(dialog.value || '') + '" />')
        + '      </div>'
        + '    </div>'
        + '    <div class="pm-dialog-actions">'
        + '      <button class="pm-btn ghost" data-close-dialog="1">取消</button>'
        + '      <button class="pm-btn primary" data-submit-text="1">保存</button>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    }

    if (dialog.type === 'confirm') {
      return ''
        + '<div class="pm-dialog-overlay" data-dialog-overlay="1">'
        + '  <div class="pm-dialog" data-dialog-box="1">'
        + '    <div class="pm-dialog-head">'
        + '      <div class="pm-dialog-title">' + escHtml(dialog.title || '确认删除') + '</div>'
        + '      <button class="pm-dialog-close" data-close-dialog="1">×</button>'
        + '    </div>'
        + '    <div class="pm-dialog-body">'
        + '      <div class="pm-help">' + escHtml(dialog.message || '确认执行该操作？') + '</div>'
        + '    </div>'
        + '    <div class="pm-dialog-actions">'
        + '      <button class="pm-btn ghost" data-close-dialog="1">取消</button>'
        + '      <button class="pm-btn primary" data-confirm-action="1">确认</button>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    }

    return '';
  }

  function buildOverviewText(state) {
    if (state.loading || !state.projects.length) return '';
    var projectCount = state.projects.length;
    var bankCount = 0;
    var groupCount = 0;
    var questionCount = 0;
    state.projects.forEach(function (project) {
      bankCount += (project.banks || []).length;
      (project.banks || []).forEach(function (bank) {
        groupCount += (bank.groups || []).length;
        questionCount += (bank.questions || []).length;
      });
    });
    return projectCount + ' 个项目 · ' + bankCount + ' 个题库 · ' + groupCount + ' 个题组 · ' + questionCount + ' 道题';
  }

  function buildProjectRow(project, state) {
    var key = String(project.id);
    var open = !!state.openProjects[key];
    var progress = calcProgress(project.questions);
    var latest = project.latest_session || null;
    return ''
      + '<section class="pm-tree-row pm-project-row' + (open ? ' open' : '') + '" data-project-id="' + project.id + '">'
      + '  <div class="pm-row-main">'
      + '    <button class="pm-tree-toggle" data-toggle-project="' + project.id + '">' + (open ? '▾' : '▸') + '</button>'
      + '    <div class="pm-identity">'
      + '      <div class="pm-row-title">' + escHtml(project.name || ('项目 #' + project.id)) + '</div>'
      + '      <div class="pm-row-desc">覆盖 ' + project.banks.length + ' 个题库，最近学习：' + escHtml(latest ? joinDefined([latest.bank_name, latest.group_name], '暂无') : '暂无') + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pm-row-stats">'
      + '    <div class="pm-stat-block">'
      + '      <div class="pm-stat-value">' + progress.done + '/' + progress.total + '</div>'
      + '      <div class="pm-stat-label">已学题目</div>'
      + '    </div>'
      + '    <div class="pm-progress-block">'
      + '      <div class="pm-progress-head"><span>学习进度</span><span>' + Math.round(progress.ratio * 100) + '%</span></div>'
      + '      <div class="pm-progress-track"><div class="pm-progress-fill" style="width:' + Math.round(progress.ratio * 100) + '%"></div></div>'
      + '    </div>'
      + '    <div class="pm-stat-block compact">'
      + '      <div class="pm-stat-value">' + project.banks.length + '</div>'
      + '      <div class="pm-stat-label">题库数</div>'
      + '    </div>'
      + '    <div class="pm-stat-block compact">'
      + '      <div class="pm-stat-value">' + escHtml(formatTime(latest ? (latest.completed_at || latest.created_at) : null)) + '</div>'
      + '      <div class="pm-stat-label">最近学习</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pm-row-actions">'
      + '    <button class="pm-inline-btn" data-create-bank="' + project.id + '">新建题库</button>'
      + '    <button class="pm-inline-btn" data-edit-project="' + project.id + '">编辑</button>'
      + '    <button class="pm-inline-btn danger" data-delete-project="' + project.id + '">删除</button>'
      + '  </div>'
      + '  <div class="pm-row-children">'
      +      project.banks.map(function (bank) { return buildBankRow(bank, project, state); }).join('')
      + '  </div>'
      + '</section>';
  }

  function buildBankRow(bank, project, state) {
    var key = String(project.id) + '.' + String(bank.id);
    var open = !!state.openBanks[key];
    var progress = calcProgress(bank.questions);
    var latest = bank.latest_session || null;
    return ''
      + '<section class="pm-tree-row pm-bank-row' + (open ? ' open' : '') + '" data-bank-id="' + bank.id + '">'
      + '  <div class="pm-row-main">'
      + '    <button class="pm-tree-toggle" data-toggle-bank="' + key + '">' + (open ? '▾' : '▸') + '</button>'
      + '    <div class="pm-identity">'
      + '      <div class="pm-row-title">' + escHtml(bank.name || ('题库 #' + bank.id)) + '</div>'
      + '      <div class="pm-row-desc">' + bank.groups.length + ' 个题组 · 最近学习：' + escHtml(latest ? joinDefined([latest.group_name, summarizeQuestion(latest.question_content)], '暂无', ' · ') : '暂无') + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pm-row-stats">'
      + '    <div class="pm-stat-block">'
      + '      <div class="pm-stat-value">' + progress.done + '/' + progress.total + '</div>'
      + '      <div class="pm-stat-label">已学 / 总题</div>'
      + '    </div>'
      + '    <div class="pm-progress-block">'
      + '      <div class="pm-progress-head"><span>完成度</span><span>' + Math.round(progress.ratio * 100) + '%</span></div>'
      + '      <div class="pm-progress-track"><div class="pm-progress-fill" style="width:' + Math.round(progress.ratio * 100) + '%"></div></div>'
      + '    </div>'
      + '    <div class="pm-stat-block compact">'
      + '      <div class="pm-stat-value">' + bank.groups.length + '</div>'
      + '      <div class="pm-stat-label">题组数</div>'
      + '    </div>'
      + '    <div class="pm-stat-block compact">'
      + '      <div class="pm-stat-value">' + escHtml(formatTime(latest ? (latest.completed_at || latest.created_at) : null)) + '</div>'
      + '      <div class="pm-stat-label">最近学习</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pm-row-actions">'
      + '    <button class="pm-inline-btn primary" data-start-bank="' + bank.id + '" data-project="' + project.id + '">开始顺序做题</button>'
      + '    <button class="pm-inline-btn" data-create-group="' + bank.id + '">新建题组</button>'
      + '    <button class="pm-inline-btn" data-edit-bank="' + bank.id + '">编辑</button>'
      + '    <button class="pm-inline-btn danger" data-delete-bank="' + bank.id + '">删除</button>'
      + '  </div>'
      + '  <div class="pm-row-children">'
      +      bank.groups.map(function (group) { return buildGroupRow(group, project, bank, state); }).join('')
      + '  </div>'
      + '</section>';
  }

  function buildGroupRow(group, project, bank, state) {
    var key = String(project.id) + '.' + String(bank.id) + '.' + String(group.id);
    var open = state.openGroups ? !!state.openGroups[key] : true;
    var progress = calcProgress(group.questions);
    return ''
      + '<section class="pm-lite-row pm-group-row' + (open ? ' open' : '') + '" data-group-id="' + group.id + '">'
      + '  <div class="pm-lite-main">'
      + '    <button class="pm-group-toggle" data-toggle-group="' + key + '">' + (open ? '▾' : '▸') + '</button>'
      + '    <div class="pm-group-identity">'
      + '      <div class="pm-lite-title">' + escHtml(group.name || ('题组 #' + group.id)) + '</div>'
      + '      <div class="pm-lite-desc">' + progress.total + ' 题 · 已总结 ' + progress.done + ' 题</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pm-lite-actions">'
      + '    <button class="pm-inline-btn primary" data-start-group="' + group.id + '" data-bank="' + bank.id + '" data-project="' + project.id + '">开始做题</button>'
      + '    <button class="pm-inline-btn" data-append-json="' + group.id + '">追加题目</button>'
      + '    <button class="pm-inline-btn" data-image-placeholder="' + group.id + '">图片导入</button>'
      + '    <button class="pm-inline-btn" data-edit-group="' + group.id + '">编辑</button>'
      + '    <button class="pm-inline-btn danger" data-delete-group="' + group.id + '">删除</button>'
      + '  </div>'
      + '  <div class="pm-question-list">'
      +      group.questions.map(function (question) { return buildQuestionRow(question); }).join('')
      + '  </div>'
      + '</section>';
  }

  function buildQuestionRow(question) {
    return ''
      + '<div class="pm-question-row" data-question-id="' + question.id + '">'
      + '  <div class="pm-question-main">'
      + '    <div class="pm-question-no">第 ' + escHtml(question.number || '?') + ' 题</div>'
      + '    <div class="pm-question-text">' + escHtml(summarizeQuestion(question.content || '')) + '</div>'
      + '  </div>'
      + '  <div class="pm-question-state' + (question.status === 'done' ? ' done' : '') + '">' + escHtml(question.status === 'done' ? '已总结' : '题目') + '</div>'
      + '  <div class="pm-question-actions">'
      + '    <button class="pm-inline-btn" data-edit-question="' + question.id + '">编辑</button>'
      + '    <button class="pm-inline-btn danger" data-delete-question="' + question.id + '">删除</button>'
      + '  </div>'
      + '</div>';
  }

  function buildTree(state) {
    if (state.loading) return '<div class="pm-loading">正在读取项目、题库与学习摘要...</div>';
    if (state.error) return '<div class="pm-error">' + escHtml(state.error) + '</div>';
    if (!state.projects.length) return '<div class="pm-empty">还没有项目。先创建一个项目，再在行内继续新建题库和题组。</div>';
    return state.projects.map(function (project) { return buildProjectRow(project, state); }).join('');
  }

  window._projectManagementView = ViewManager.registerView('project-management', {
    create: function () {
      var state = {
        loading: true,
        error: '',
        projects: [],
        dialog: null,
        openProjects: {},
        openBanks: {},
        openGroups: {},
      };

      function getProjectById(id) {
        return state.projects.find(function (item) { return String(item.id) === String(id); }) || null;
      }

      function getBankById(id) {
        for (var i = 0; i < state.projects.length; i++) {
          var bank = (state.projects[i].banks || []).find(function (item) { return String(item.id) === String(id); });
          if (bank) return bank;
        }
        return null;
      }

      function getGroupById(id) {
        for (var i = 0; i < state.projects.length; i++) {
          var banks = state.projects[i].banks || [];
          for (var j = 0; j < banks.length; j++) {
            var group = (banks[j].groups || []).find(function (item) { return String(item.id) === String(id); });
            if (group) return group;
          }
        }
        return null;
      }

      function getQuestionById(id) {
        for (var i = 0; i < state.projects.length; i++) {
          var banks = state.projects[i].banks || [];
          for (var j = 0; j < banks.length; j++) {
            var groups = banks[j].groups || [];
            for (var k = 0; k < groups.length; k++) {
              var question = (groups[k].questions || []).find(function (item) { return String(item.id) === String(id); });
              if (question) return question;
            }
          }
        }
        return null;
      }

      function render() {
        return ''
          + '<div class="pm-root">'
          + '  <div class="pm-shell pm-shell-tree">'
          + '    <div class="pm-topbar pm-topbar-tree">'
          + '      <div class="pm-headline">'
          + '        <div class="pm-kicker">Project Workspace</div>'
          + '        <div class="pm-title">项目管理</div>'
          + '        <div class="pm-subtitle">' + escHtml(buildOverviewText(state)) + '</div>'
          + '      </div>'
          + '      <div class="pm-actions">'
          + '        <button class="pm-btn" data-refresh="1">刷新</button>'
          + '        <button class="pm-btn primary" data-create-project="1">新建项目</button>'
          + '      </div>'
          + '    </div>'
          + '    <div class="pm-card pm-tree-card">'
          + '      <div class="pm-card-head">'
          + '        <div>'
          + '          <div class="pm-card-title">项目列表</div>'
          + '        </div>'
          + '      </div>'
          + '      <div class="pm-tree-list">' + buildTree(state) + '</div>'
          + '    </div>'
          +        createDialogMarkup(state)
          + '  </div>'
          + '</div>';
      }

      function mount() {
        Shell.setContent(render());
        Shell.setMeta('');
        Shell.clearActions();
        bind(document.getElementById('contentArea'));
      }

      function refresh() {
        state.loading = true;
        state.error = '';
        mount();
        return api.query('session.catalog', {}).then(function (catalog) {
          if (catalog && catalog.ok === false) throw new Error(catalog.error || '读取学习记录失败');
          return api.query('project.list', {}).then(function (projects) {
            if (projects && projects.ok === false) throw new Error(projects.error || '读取项目失败');
            projects = projects || [];
            return Promise.all(projects.map(function (project) {
              return api.query('bank.list', { project_id: project.id }).then(function (banks) {
                if (banks && banks.ok === false) throw new Error(banks.error || '读取题库失败');
                banks = banks || [];
                return Promise.all(banks.map(function (bank) {
                  return Promise.all([
                    api.query('group.list', { bank_id: bank.id }),
                    api.query('question.list', { bank_id: bank.id }),
                  ]).then(function (parts) {
                    var groups = parts[0];
                    var questions = parts[1];
                    if (groups && groups.ok === false) throw new Error(groups.error || '读取题组失败');
                    if (questions && questions.ok === false) throw new Error(questions.error || '读取题目失败');
                    groups = groups || [];
                    questions = questions || [];
                    var sessionGroups = (catalog && catalog.groups ? catalog.groups : []).filter(function (item) {
                      return Number(item.project_id) === Number(project.id) && Number(item.bank_id) === Number(bank.id);
                    });
                    var flatSessions = [];
                    sessionGroups.forEach(function (item) {
                      flatSessions = flatSessions.concat(item.sessions || []);
                    });
                    flatSessions.sort(byCreatedDesc);
                    var builtGroups = groups.map(function (group) {
                      var groupQuestions = questions.filter(function (question) {
                        return Number(question.group_id) === Number(group.id);
                      });
                      return {
                        id: group.id,
                        name: group.name,
                        bank_id: bank.id,
                        project_id: project.id,
                        questions: groupQuestions,
                      };
                    });
                    return {
                      id: bank.id,
                      name: bank.name,
                      project_id: project.id,
                      groups: builtGroups,
                      questions: questions,
                      latest_session: flatSessions[0] || null,
                    };
                  });
                })).then(function (builtBanks) {
                  var allQuestions = [];
                  builtBanks.forEach(function (bank) {
                    allQuestions = allQuestions.concat(bank.questions || []);
                  });
                  var flat = [];
                  builtBanks.forEach(function (bank) {
                    if (bank.latest_session) flat.push(bank.latest_session);
                  });
                  flat.sort(byCreatedDesc);
                  return {
                    id: project.id,
                    name: project.name,
                    banks: builtBanks,
                    questions: allQuestions,
                    latest_session: flat[0] || null,
                  };
                });
              });
            }));
          });
        }).then(function (projects) {
          state.projects = projects || [];
          state.loading = false;
          mount();
        }).catch(function (err) {
          state.loading = false;
          state.error = err && err.message ? err.message : '读取失败';
          mount();
        });
      }

      function closeDialog() {
        state.dialog = null;
        mount();
      }

      function openTextDialog(config) {
        state.dialog = {
          type: 'text-edit',
          title: config.title,
          label: config.label,
          help: config.help,
          value: config.value || '',
          multiline: !!config.multiline,
          onSubmit: config.onSubmit,
        };
        mount();
      }

      function openDeleteDialog(config) {
        state.dialog = {
          type: 'confirm',
          title: config.title || '确认删除',
          message: config.message,
          onSubmit: config.onSubmit,
        };
        mount();
      }

      function openJsonImportDialog(groupId) {
        state.dialog = {
          type: 'json-import',
          groupId: groupId,
          raw: '',
          previewItems: null,
          previewError: '',
        };
        mount();
      }

      function submitTextDialog() {
        if (!state.dialog || !state.dialog.onSubmit) return;
        var input = document.querySelector('[data-text-input="1"]');
        var value = input ? input.value : '';
        Promise.resolve(state.dialog.onSubmit(value)).then(function (resp) {
          if (resp && resp.ok === false) throw new Error(resp.error || '操作失败');
          closeDialog();
          refresh();
        }).catch(function (err) {
          showToast(err && err.message ? err.message : '操作失败');
        });
      }

      function previewImport() {
        var input = document.querySelector('[data-json-input="1"]');
        if (!input) return;
        try {
          var items = parseJsonArrayText(input.value);
          state.dialog.raw = input.value;
          state.dialog.previewItems = items;
          state.dialog.previewError = '';
        } catch (err) {
          state.dialog.raw = input.value;
          state.dialog.previewItems = null;
          state.dialog.previewError = err.message;
        }
        mount();
      }

      function submitImport() {
        var input = document.querySelector('[data-json-input="1"]');
        if (!input || !state.dialog) return;
        var items;
        try {
          items = parseJsonArrayText(input.value);
        } catch (err) {
          state.dialog.previewItems = null;
          state.dialog.previewError = err.message;
          mount();
          return;
        }
        api.query('question.append_json', {
          group_id: state.dialog.groupId,
          questions: items,
        }).then(function (resp) {
          if (resp && resp.ok === false) throw new Error(resp.error || '导入失败');
          closeDialog();
          refresh();
          showToast('已追加 ' + items.length + ' 道题');
        }).catch(function (err) {
          showToast(err && err.message ? err.message : '导入失败');
        });
      }

      function startExercise(payload) {
        if (window.AppShell && typeof window.AppShell.setExerciseTarget === 'function') {
          window.AppShell.setExerciseTarget(payload);
        }
        if (window._exerciseView) {
          ViewManager.show(window._exerciseView, Object.assign({ view: 'exercise', _forceNew: true }, payload));
        }
      }

      function setTreeRowOpen(row, open, toggleSelector) {
        if (!row) return;
        row.classList.toggle('open', !!open);
        var toggle = row.querySelector(toggleSelector);
        if (toggle) toggle.textContent = open ? '▾' : '▸';
      }

      function bind(root) {
        if (!root) return;

        root.querySelectorAll('[data-toggle-project]').forEach(function (el) {
          el.addEventListener('click', function () {
            var key = String(el.getAttribute('data-toggle-project'));
            state.openProjects[key] = !state.openProjects[key];
            setTreeRowOpen(el.closest('.pm-project-row'), !!state.openProjects[key], '[data-toggle-project]');
          });
        });

        root.querySelectorAll('[data-toggle-bank]').forEach(function (el) {
          el.addEventListener('click', function () {
            var key = String(el.getAttribute('data-toggle-bank'));
            state.openBanks[key] = !state.openBanks[key];
            setTreeRowOpen(el.closest('.pm-bank-row'), !!state.openBanks[key], '[data-toggle-bank]');
          });
        });

        root.querySelectorAll('[data-toggle-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            var key = String(el.getAttribute('data-toggle-group'));
            state.openGroups[key] = !state.openGroups[key];
            setTreeRowOpen(el.closest('.pm-group-row'), !!state.openGroups[key], '[data-toggle-group]');
          });
        });

        var refreshBtn = root.querySelector('[data-refresh="1"]');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);

        var createProjectBtn = root.querySelector('[data-create-project="1"]');
        if (createProjectBtn) {
          createProjectBtn.addEventListener('click', function () {
            openTextDialog({
              title: '新建项目',
              label: '项目名称',
              help: '项目是最外层学习主题，例如微积分、线性代数、经济学。',
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('项目名称不能为空'));
                return api.query('project.create', { name: value });
              },
            });
          });
        }

        root.querySelectorAll('[data-create-bank]').forEach(function (el) {
          el.addEventListener('click', function () {
            var project = getProjectById(el.getAttribute('data-create-bank'));
            if (!project) return;
            openTextDialog({
              title: '新建题库',
              label: '题库名称',
              help: '题库对应一套具体来源或教材。',
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('题库名称不能为空'));
                return api.query('bank.create', { project_id: project.id, name: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-create-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            var bank = getBankById(el.getAttribute('data-create-group'));
            if (!bank) return;
            openTextDialog({
              title: '新建题组',
              label: '题组名称',
              help: '题组可对应章节、专题或任意你想分组的学习单元。',
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('题组名称不能为空'));
                return api.query('group.create', { bank_id: bank.id, name: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-edit-project]').forEach(function (el) {
          el.addEventListener('click', function () {
            var project = getProjectById(el.getAttribute('data-edit-project'));
            if (!project) return;
            openTextDialog({
              title: '编辑项目',
              label: '项目名称',
              help: '修改后会立即影响侧边栏和做题上下文路径。',
              value: project.name,
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('项目名称不能为空'));
                return api.query('project.update', { id: project.id, name: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-edit-bank]').forEach(function (el) {
          el.addEventListener('click', function () {
            var bank = getBankById(el.getAttribute('data-edit-bank'));
            if (!bank) return;
            openTextDialog({
              title: '编辑题库',
              label: '题库名称',
              help: '建议用教材名、学校题库名或来源名命名。',
              value: bank.name,
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('题库名称不能为空'));
                return api.query('bank.update', { id: bank.id, name: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-edit-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            var group = getGroupById(el.getAttribute('data-edit-group'));
            if (!group) return;
            openTextDialog({
              title: '编辑题组',
              label: '题组名称',
              help: '建议用章节或专题名命名。',
              value: group.name,
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('题组名称不能为空'));
                return api.query('group.update', { id: group.id, name: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-edit-question]').forEach(function (el) {
          el.addEventListener('click', function () {
            var question = getQuestionById(el.getAttribute('data-edit-question'));
            if (!question) return;
            openTextDialog({
              title: '编辑题目',
              label: '题目内容',
              help: '这里只修改题干正文，题号仍由系统维护。',
              value: question.content || '',
              multiline: true,
              onSubmit: function (value) {
                value = value.trim();
                if (!value) return Promise.reject(new Error('题目内容不能为空'));
                return api.query('question.update', { id: question.id, content: value });
              },
            });
          });
        });

        root.querySelectorAll('[data-delete-project]').forEach(function (el) {
          el.addEventListener('click', function () {
            var project = getProjectById(el.getAttribute('data-delete-project'));
            if (!project) return;
            openDeleteDialog({
              message: '将删除项目“' + project.name + '”以及其下所有题库、题组、题目。此操作不可撤销。',
              onSubmit: function () { return api.query('project.delete', { id: project.id }); },
            });
          });
        });

        root.querySelectorAll('[data-delete-bank]').forEach(function (el) {
          el.addEventListener('click', function () {
            var bank = getBankById(el.getAttribute('data-delete-bank'));
            if (!bank) return;
            openDeleteDialog({
              message: '将删除题库“' + bank.name + '”以及其下所有题组、题目。此操作不可撤销。',
              onSubmit: function () { return api.query('bank.delete', { id: bank.id }); },
            });
          });
        });

        root.querySelectorAll('[data-delete-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            var group = getGroupById(el.getAttribute('data-delete-group'));
            if (!group) return;
            openDeleteDialog({
              message: '将删除题组“' + group.name + '”以及其下所有题目。',
              onSubmit: function () { return api.query('group.delete', { id: group.id }); },
            });
          });
        });

        root.querySelectorAll('[data-delete-question]').forEach(function (el) {
          el.addEventListener('click', function () {
            var question = getQuestionById(el.getAttribute('data-delete-question'));
            if (!question) return;
            openDeleteDialog({
              message: '将删除第 ' + (question.number || '?') + ' 题。',
              onSubmit: function () { return api.query('question.delete', { id: question.id }); },
            });
          });
        });

        root.querySelectorAll('[data-start-bank]').forEach(function (el) {
          el.addEventListener('click', function () {
            startExercise({
              project_id: parseInt(el.getAttribute('data-project'), 10),
              bank_id: parseInt(el.getAttribute('data-start-bank'), 10),
            });
          });
        });

        root.querySelectorAll('[data-start-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            startExercise({
              project_id: parseInt(el.getAttribute('data-project'), 10),
              bank_id: parseInt(el.getAttribute('data-bank'), 10),
              group_id: parseInt(el.getAttribute('data-start-group'), 10),
            });
          });
        });

        root.querySelectorAll('[data-append-json]').forEach(function (el) {
          el.addEventListener('click', function () {
            openJsonImportDialog(parseInt(el.getAttribute('data-append-json'), 10));
          });
        });

        root.querySelectorAll('[data-image-placeholder]').forEach(function (el) {
          el.addEventListener('click', function () {
            showToast('图片交互导入第一期暂未实现');
          });
        });

        root.querySelectorAll('[data-close-dialog]').forEach(function (el) {
          el.addEventListener('click', closeDialog);
        });

        var overlay = root.querySelector('[data-dialog-overlay="1"]');
        if (overlay) {
          overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeDialog();
          });
        }

        var saveText = root.querySelector('[data-submit-text="1"]');
        if (saveText) saveText.addEventListener('click', submitTextDialog);

        var previewBtn = root.querySelector('[data-preview-json="1"]');
        if (previewBtn) previewBtn.addEventListener('click', previewImport);

        var submitJson = root.querySelector('[data-submit-json="1"]');
        if (submitJson) submitJson.addEventListener('click', submitImport);

        var confirmBtn = root.querySelector('[data-confirm-action="1"]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function () {
            if (!state.dialog || !state.dialog.onSubmit) return;
            Promise.resolve(state.dialog.onSubmit()).then(function (resp) {
              if (resp && resp.ok === false) throw new Error(resp.error || '删除失败');
              closeDialog();
              refresh();
            }).catch(function (err) {
              showToast(err && err.message ? err.message : '删除失败');
            });
          });
        }
      }

      return {
        activate: function () {
          return {
            title: '项目管理',
            content: render(),
            mount: function () {
              bind(document.getElementById('contentArea'));
              refresh();
            },
          };
        },
        suspend: function () {},
        deactivate: function () {},
        match: function () { return false; },
      };
    },
  });
})();
