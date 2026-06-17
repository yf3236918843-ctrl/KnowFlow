(function () {
  'use strict';

  function truncate(text, limit) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '...';
  }

  function cloneStroke(stroke) {
    return {
      color: stroke.color,
      size: stroke.size,
      points: (stroke.points || []).map(function (p) {
        return { x: p.x, y: p.y };
      }),
    };
  }

  function computeStrokeBounds(strokes, padding) {
    var all = [];
    (strokes || []).forEach(function (stroke) {
      if (!stroke || !stroke.points || !stroke.points.length) return;
      var half = Math.max(Number(stroke.size || 0) / 2, 1);
      stroke.points.forEach(function (point) {
        all.push({
          left: point.x - half,
          top: point.y - half,
          right: point.x + half,
          bottom: point.y + half,
        });
      });
    });

    if (!all.length) return null;

    var pad = Math.max(Number(padding || 0), 0);
    var left = all[0].left;
    var top = all[0].top;
    var right = all[0].right;
    var bottom = all[0].bottom;

    all.forEach(function (box) {
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    });

    return {
      left: Math.max(0, Math.floor(left - pad)),
      top: Math.max(0, Math.floor(top - pad)),
      right: Math.ceil(right + pad),
      bottom: Math.ceil(bottom + pad),
    };
  }

  function buildRenderableStrokes(strokes, currentStroke) {
    var list = (strokes || []).map(cloneStroke);
    if (currentStroke && currentStroke.points && currentStroke.points.length) {
      list.push(cloneStroke(currentStroke));
    }
    return list;
  }

  function shouldStartPan(tool, button) {
    return button === 1 || tool === 'hand';
  }

  function isUndoShortcut(event) {
    if (!event || !event.ctrlKey || event.shiftKey) return false;
    return String(event.key || '').toLowerCase() === 'z';
  }

  function createDefaultDrawState() {
    return {
      currentQuestionIndex: 0,
      tool: 'pen',
      color: '#EDEDEF',
      size: 3,
      strokes: [],
      redoStack: [],
      currentStroke: null,
      isDrawing: false,
      isPanning: false,
      lastX: 0,
      lastY: 0,
      panX: 0,
      panY: 0,
      dpr: 1,
    };
  }

  var _persistedDrawState = createDefaultDrawState();

  function getPersistedState() {
    return {
      currentQuestionIndex: _persistedDrawState.currentQuestionIndex || 0,
      tool: _persistedDrawState.tool || 'pen',
      color: _persistedDrawState.color || '#EDEDEF',
      size: _persistedDrawState.size || 3,
      strokes: (_persistedDrawState.strokes || []).map(cloneStroke),
      redoStack: (_persistedDrawState.redoStack || []).map(cloneStroke),
      currentStroke: _persistedDrawState.currentStroke ? cloneStroke(_persistedDrawState.currentStroke) : null,
      isDrawing: false,
      isPanning: false,
      lastX: 0,
      lastY: 0,
      panX: _persistedDrawState.panX || 0,
      panY: _persistedDrawState.panY || 0,
      dpr: 1,
    };
  }

  function mergePersistedState(patch) {
    patch = patch || {};
    if (patch.currentQuestionIndex != null) _persistedDrawState.currentQuestionIndex = patch.currentQuestionIndex;
    if (patch.tool != null) _persistedDrawState.tool = patch.tool;
    if (patch.color != null) _persistedDrawState.color = patch.color;
    if (patch.size != null) _persistedDrawState.size = patch.size;
    if (patch.panX != null) _persistedDrawState.panX = patch.panX;
    if (patch.panY != null) _persistedDrawState.panY = patch.panY;
    if (patch.strokes) _persistedDrawState.strokes = patch.strokes.map(cloneStroke);
    if (patch.redoStack) _persistedDrawState.redoStack = patch.redoStack.map(cloneStroke);
    if (patch.currentStroke) _persistedDrawState.currentStroke = cloneStroke(patch.currentStroke);
    if (patch.currentStroke === null) _persistedDrawState.currentStroke = null;
    return getPersistedState();
  }

  function resetPersistedState() {
    _persistedDrawState = createDefaultDrawState();
    return getPersistedState();
  }

  function clearPersistedDrawing() {
    _persistedDrawState.strokes = [];
    _persistedDrawState.redoStack = [];
    _persistedDrawState.currentStroke = null;
    return getPersistedState();
  }

  function getExportPalette() {
    return {
      background: '#FFFFFF',
      stroke: '#111111',
    };
  }

  function computePixelBounds(imageData, padding) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
    var width = imageData.width;
    var height = imageData.height;
    var data = imageData.data;
    var found = false;
    var minX = width - 1;
    var minY = height - 1;
    var maxX = 0;
    var maxY = 0;

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var alpha = data[(y * width + x) * 4 + 3];
        if (!alpha) continue;
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (!found) return null;

    var pad = Math.max(Number(padding || 0), 0);
    return {
      left: Math.max(0, minX - pad),
      top: Math.max(0, minY - pad),
      right: Math.min(width, maxX + pad + 1),
      bottom: Math.min(height, maxY + pad + 1),
    };
  }

  function computeWorldBounds(strokes, padding) {
    var all = [];
    (strokes || []).forEach(function (stroke) {
      if (!stroke || !stroke.points || !stroke.points.length) return;
      var half = Math.max(Number(stroke.size || 0) / 2, 1);
      stroke.points.forEach(function (point) {
        all.push({
          left: point.x - half,
          top: point.y - half,
          right: point.x + half,
          bottom: point.y + half,
        });
      });
    });

    if (!all.length) return null;

    var pad = Math.max(Number(padding || 0), 0);
    var left = all[0].left;
    var top = all[0].top;
    var right = all[0].right;
    var bottom = all[0].bottom;

    all.forEach(function (box) {
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    });

    return {
      left: Math.floor(left - pad),
      top: Math.floor(top - pad),
      right: Math.ceil(right + pad),
      bottom: Math.ceil(bottom + pad),
    };
  }

  function renderQuestionCard(questions, idx) {
    var total = Math.max((questions || []).length, 1);
    var safeIdx = Math.max(0, Math.min(idx, total - 1));
    var q = (questions && questions[safeIdx]) || { content: '' };
    return ''
      + '<div class="draw-qn-wrap">'
      + '  <button class="draw-nav-btn" type="button" data-draw-nav="-1"' + (safeIdx <= 0 ? ' disabled' : '') + '>‹</button>'
      + '  <div class="draw-qn-card">'
      + '    <div class="draw-qn-meta">' + (safeIdx + 1) + '/' + total + '</div>'
      + '    <div class="draw-qn-text">' + renderMath(esc(q.content || '')) + '</div>'
      + '  </div>'
      + '  <button class="draw-nav-btn" type="button" data-draw-nav="1"' + (safeIdx >= total - 1 ? ' disabled' : '') + '>›</button>'
      + '</div>';
  }

  function renderToolbar() {
    return ''
      + '<div class="draw-toolbar" data-draw-toolbar="1">'
      + '  <button class="draw-tool active" type="button" data-draw-tool="pen" title="画笔">✎</button>'
      + '  <button class="draw-tool" type="button" data-draw-tool="hand" title="平移">✥</button>'
      + '  <div class="draw-sep"></div>'
      + '  <div class="draw-colors" data-draw-colors="1"></div>'
      + '  <div class="draw-sep"></div>'
      + '  <div class="draw-size-wrap">'
      + '    <input class="draw-size" type="range" min="1" max="20" step="0.5" value="3" data-draw-size="1">'
      + '    <span class="draw-size-label" data-draw-size-label="1">3</span>'
      + '  </div>'
      + '  <div class="draw-sep"></div>'
      + '  <button class="draw-action" type="button" data-draw-action="undo" disabled>撤销</button>'
      + '  <button class="draw-action" type="button" data-draw-action="redo" disabled>重做</button>'
      + '  <button class="draw-action danger" type="button" data-draw-action="clear">清空</button>'
      + '  <button class="draw-action primary" type="button" data-draw-action="back">返回</button>'
      + '</div>';
  }

  function renderRoot() {
    return ''
      + '<div class="draw-view">'
      + '  <div class="draw-stage">'
      + '    <div class="draw-question" data-draw-question="1"></div>'
      + '    <div class="draw-canvas-wrap" data-draw-canvas-wrap="1">'
      + '      <canvas class="draw-canvas" data-draw-canvas="1"></canvas>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  var createDrawView = ViewManager.registerView('draw', {
    create: function (args) {
      var state = getPersistedState();
      state.questions = (args && args.questions) || [];
      if (args && args.currentQuestionIndex != null && !state.strokes.length && !state.currentStroke) {
        state.currentQuestionIndex = args.currentQuestionIndex || 0;
      }

      var refs = {};
      var rootBound = null;
      var actionsBound = null;
      var resizeBound = null;
      var colors = ['#EDEDEF', '#d4665a', '#c9a87c', '#5a9b6a', '#5E6AD2', '#8b6fc8'];

      function cacheRefs() {
        refs.root = document.querySelector('.draw-view');
        if (!refs.root) return;
        refs.actions = document.getElementById('ctxActions');
        refs.question = refs.root.querySelector('[data-draw-question="1"]');
        refs.canvasWrap = refs.root.querySelector('[data-draw-canvas-wrap="1"]');
        refs.canvas = refs.root.querySelector('[data-draw-canvas="1"]');
        refs.ctx = refs.canvas ? refs.canvas.getContext('2d') : null;
        refs.colorWrap = refs.actions ? refs.actions.querySelector('[data-draw-colors="1"]') : null;
        refs.size = refs.actions ? refs.actions.querySelector('[data-draw-size="1"]') : null;
        refs.sizeLabel = refs.actions ? refs.actions.querySelector('[data-draw-size-label="1"]') : null;
        refs.undo = refs.actions ? refs.actions.querySelector('[data-draw-action="undo"]') : null;
        refs.redo = refs.actions ? refs.actions.querySelector('[data-draw-action="redo"]') : null;
      }

      function renderToolbarState() {
        if (!refs.actions) return;
        mergePersistedState({
          tool: state.tool,
          color: state.color,
          size: state.size,
          strokes: state.strokes,
          redoStack: state.redoStack,
          currentStroke: state.currentStroke,
          currentQuestionIndex: state.currentQuestionIndex,
          panX: state.panX,
          panY: state.panY,
        });
        refs.actions.querySelectorAll('[data-draw-tool]').forEach(function (el) {
          el.classList.toggle('active', el.getAttribute('data-draw-tool') === state.tool);
        });
        if (refs.colorWrap) {
          refs.colorWrap.innerHTML = colors.map(function (color) {
            return '<button class="draw-color' + (color === state.color ? ' active' : '') + '" type="button" data-draw-color="' + color + '" style="background:' + color + '"></button>';
          }).join('');
        }
        if (refs.size) refs.size.value = String(state.size);
        if (refs.sizeLabel) refs.sizeLabel.textContent = String(state.size);
        if (refs.undo) refs.undo.disabled = state.strokes.length === 0;
        if (refs.redo) refs.redo.disabled = state.redoStack.length === 0;
      }

      function renderQuestion() {
        if (!refs.question) return;
        mergePersistedState({ currentQuestionIndex: state.currentQuestionIndex });
        refs.question.innerHTML = renderQuestionCard(state.questions, state.currentQuestionIndex);
        if (typeof renderAll === 'function') renderAll(refs.question);
      }

      function resizeCanvas() {
        if (!refs.canvasWrap || !refs.canvas) return;
        var rect = refs.canvasWrap.getBoundingClientRect();
        state.dpr = window.devicePixelRatio || 1;
        refs.canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
        refs.canvas.height = Math.max(1, Math.round(rect.height * state.dpr));
        refs.canvas.style.width = rect.width + 'px';
        refs.canvas.style.height = rect.height + 'px';
        draw();
      }

      function screenToWorld(clientX, clientY) {
        var rect = refs.canvas.getBoundingClientRect();
        return {
          x: (clientX - rect.left) + state.panX,
          y: (clientY - rect.top) + state.panY,
        };
      }

      function drawStroke(stroke) {
        if (!refs.ctx || !stroke || !stroke.points || stroke.points.length < 2) return;
        var ctx = refs.ctx;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x - state.panX, stroke.points[0].y - state.panY);
        for (var i = 1; i < stroke.points.length; i++) {
          var point = stroke.points[i];
          ctx.lineTo(point.x - state.panX, point.y - state.panY);
        }
        ctx.stroke();
        ctx.restore();
      }

      function drawGrid() {
        if (!refs.ctx || !refs.canvas) return;
        var ctx = refs.ctx;
        var width = refs.canvas.width / state.dpr;
        var height = refs.canvas.height / state.dpr;
        var size = 40;
        var startX = Math.floor(state.panX / size) * size;
        var startY = Math.floor(state.panY / size) * size;
        var endX = state.panX + width;
        var endY = state.panY + height;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        for (var x = startX; x <= endX; x += size) {
          for (var y = startY; y <= endY; y += size) {
            ctx.beginPath();
            ctx.arc(x - state.panX, y - state.panY, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      function draw() {
        if (!refs.ctx || !refs.canvas) return;
        refs.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        refs.ctx.clearRect(0, 0, refs.canvas.width / state.dpr, refs.canvas.height / state.dpr);
        drawGrid();
        buildRenderableStrokes(state.strokes, state.currentStroke).forEach(drawStroke);
      }

      function pushCurrentStroke() {
        if (!state.currentStroke || !state.currentStroke.points || state.currentStroke.points.length < 2) {
          state.currentStroke = null;
          mergePersistedState({ currentStroke: null });
          draw();
          return;
        }
        state.strokes.push(cloneStroke(state.currentStroke));
        state.currentStroke = null;
        state.redoStack = [];
        mergePersistedState({
          strokes: state.strokes,
          redoStack: state.redoStack,
          currentStroke: null,
        });
        renderToolbarState();
        draw();
      }

      function exportCroppedImage() {
        var renderableStrokes = buildRenderableStrokes(state.strokes, state.currentStroke);
        if (!renderableStrokes.length || !refs.canvas) return null;

        var worldBounds = computeWorldBounds(renderableStrokes, 12);
        if (!worldBounds) return null;

        var fullCanvas = document.createElement('canvas');
        fullCanvas.width = Math.max(1, worldBounds.right - worldBounds.left);
        fullCanvas.height = Math.max(1, worldBounds.bottom - worldBounds.top);
        var fullCtx = fullCanvas.getContext('2d');
        var palette = getExportPalette();
        fullCtx.fillStyle = palette.background;
        fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        fullCtx.lineCap = 'round';
        fullCtx.lineJoin = 'round';
        renderableStrokes.forEach(function (stroke) {
          if (!stroke.points || stroke.points.length < 2) return;
          fullCtx.save();
          fullCtx.strokeStyle = palette.stroke;
          fullCtx.lineWidth = stroke.size;
          fullCtx.beginPath();
          fullCtx.moveTo(stroke.points[0].x - worldBounds.left, stroke.points[0].y - worldBounds.top);
          for (var i = 1; i < stroke.points.length; i++) {
            var point = stroke.points[i];
            fullCtx.lineTo(point.x - worldBounds.left, point.y - worldBounds.top);
          }
          fullCtx.stroke();
          fullCtx.restore();
        });

        var fullImageData = fullCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
        var bounds = computePixelBounds(fullImageData, 0);
        if (!bounds) return null;

        var exportCanvas = document.createElement('canvas');
        exportCanvas.width = Math.max(1, bounds.right - bounds.left);
        exportCanvas.height = Math.max(1, bounds.bottom - bounds.top);
        var exportCtx = exportCanvas.getContext('2d');
        exportCtx.drawImage(
          fullCanvas,
          bounds.left, bounds.top, exportCanvas.width, exportCanvas.height,
          0, 0, exportCanvas.width, exportCanvas.height
        );

        var dataUrl = exportCanvas.toDataURL('image/png');
        return {
          image: dataUrl,
          preview: dataUrl,
          bounds: bounds,
          width: exportCanvas.width,
          height: exportCanvas.height,
        };
      }

      function handleBack() {
        var result = exportCroppedImage();
        if (!result) {
          ViewManager.back(null);
          return;
        }
        ViewManager.back(result);
      }

      function handlePointerDown(event) {
        if (!refs.canvas) return;
        var world = screenToWorld(event.clientX, event.clientY);
        if (shouldStartPan(state.tool, event.button)) {
          if (event.preventDefault) event.preventDefault();
          state.isPanning = true;
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          return;
        }
        state.isDrawing = true;
        state.currentStroke = {
          color: state.color,
          size: state.size,
          points: [{ x: world.x, y: world.y }],
        };
        mergePersistedState({ currentStroke: state.currentStroke });
        try { refs.canvas.setPointerCapture(event.pointerId); } catch (e) {}
      }

      function handlePointerMove(event) {
        if (state.isPanning) {
          state.panX -= (event.clientX - state.lastX);
          state.panY -= (event.clientY - state.lastY);
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          mergePersistedState({ panX: state.panX, panY: state.panY });
          draw();
          return;
        }
        if (state.isDrawing && state.currentStroke) {
          var world = screenToWorld(event.clientX, event.clientY);
          state.currentStroke.points.push({ x: world.x, y: world.y });
          mergePersistedState({ currentStroke: state.currentStroke });
          draw();
        }
      }

      function handlePointerUp(event) {
        if (state.isPanning) {
          state.isPanning = false;
        }
        if (state.isDrawing) {
          state.isDrawing = false;
          try { refs.canvas.releasePointerCapture(event.pointerId); } catch (e) {}
          pushCurrentStroke();
        }
      }

      function bindCanvas() {
        if (!refs.canvas) return;
        refs.canvas.addEventListener('pointerdown', handlePointerDown);
        refs.canvas.addEventListener('pointermove', handlePointerMove);
        refs.canvas.addEventListener('pointerup', handlePointerUp);
        refs.canvas.addEventListener('pointercancel', handlePointerUp);
        refs.canvas.addEventListener('pointerleave', handlePointerUp);
      }

      function unbindCanvas() {
        if (!refs.canvas) return;
        refs.canvas.removeEventListener('pointerdown', handlePointerDown);
        refs.canvas.removeEventListener('pointermove', handlePointerMove);
        refs.canvas.removeEventListener('pointerup', handlePointerUp);
        refs.canvas.removeEventListener('pointercancel', handlePointerUp);
        refs.canvas.removeEventListener('pointerleave', handlePointerUp);
      }

      function handleRootClick(event) {
        if (!refs.root || !refs.root.contains(event.target)) return;
        var nav = event.target.closest('[data-draw-nav]');
        if (!nav) return;
        state.currentQuestionIndex += parseInt(nav.getAttribute('data-draw-nav'), 10) || 0;
        state.currentQuestionIndex = Math.max(0, Math.min(state.currentQuestionIndex, Math.max(state.questions.length - 1, 0)));
        renderQuestion();
      }

      function handleActionsClick(event) {
        if (!refs.actions || !refs.actions.contains(event.target)) return;

        var tool = event.target.closest('[data-draw-tool]');
        if (tool) {
          state.tool = tool.getAttribute('data-draw-tool') || 'pen';
          renderToolbarState();
          return;
        }

        var color = event.target.closest('[data-draw-color]');
        if (color) {
          state.color = color.getAttribute('data-draw-color') || state.color;
          renderToolbarState();
          return;
        }

        var action = event.target.closest('[data-draw-action]');
        if (!action) return;
        var kind = action.getAttribute('data-draw-action');
        if (kind === 'undo' && state.strokes.length) {
          performUndo();
        } else if (kind === 'redo' && state.redoStack.length) {
          performRedo();
        } else if (kind === 'clear') {
          state.strokes = [];
          state.redoStack = [];
          state.currentStroke = null;
          clearPersistedDrawing();
          renderToolbarState();
          draw();
        } else if (kind === 'back') {
          handleBack();
        }
      }

      function handleSizeInput(event) {
        if (!event.target || event.target.getAttribute('data-draw-size') !== '1') return;
        state.size = parseFloat(event.target.value) || 3;
        renderToolbarState();
      }

      function performUndo() {
        if (!state.strokes.length) return;
        state.redoStack.push(cloneStroke(state.strokes[state.strokes.length - 1]));
        state.strokes.pop();
        mergePersistedState({ strokes: state.strokes, redoStack: state.redoStack });
        renderToolbarState();
        draw();
      }

      function performRedo() {
        if (!state.redoStack.length) return;
        state.strokes.push(cloneStroke(state.redoStack[state.redoStack.length - 1]));
        state.redoStack.pop();
        mergePersistedState({ strokes: state.strokes, redoStack: state.redoStack });
        renderToolbarState();
        draw();
      }

      function handleKeyDown(event) {
        if (isUndoShortcut(event)) {
          if (event.preventDefault) event.preventDefault();
          performUndo();
        }
      }

      function bindRoot() {
        if (!refs.root) return;
        if (!rootBound) {
          refs.root.addEventListener('click', handleRootClick);
          rootBound = refs.root;
        }
        if (!resizeBound) {
          resizeBound = resizeCanvas;
          window.addEventListener('resize', resizeBound);
          window.addEventListener('keydown', handleKeyDown);
        }
      }

      function bindActions() {
        if (!refs.actions || actionsBound) return;
        refs.actions.addEventListener('click', handleActionsClick);
        refs.actions.addEventListener('input', handleSizeInput);
        actionsBound = refs.actions;
      }

      function unbindRoot() {
        if (rootBound) {
          rootBound.removeEventListener('click', handleRootClick);
          rootBound = null;
        }
        if (resizeBound) {
          window.removeEventListener('resize', resizeBound);
          window.removeEventListener('keydown', handleKeyDown);
          resizeBound = null;
        }
      }

      function unbindActions() {
        if (!actionsBound) return;
        actionsBound.removeEventListener('click', handleActionsClick);
        actionsBound.removeEventListener('input', handleSizeInput);
        actionsBound = null;
      }

      return {
        activate: function () {
          return {
            title: '画图',
            content: renderRoot(),
            mount: function () {
              if (window.Shell && typeof Shell.setActions === 'function') {
                Shell.setActions(renderToolbar());
              }
              cacheRefs();
              bindRoot();
              bindActions();
              bindCanvas();
              renderQuestion();
              renderToolbarState();
              resizeCanvas();
            },
          };
        },
        suspend: function () {},
        deactivate: function () {
          unbindCanvas();
          unbindActions();
          unbindRoot();
          if (window.Shell && typeof Shell.clearActions === 'function') {
            Shell.clearActions();
          }
        },
        match: function () { return false; },
      };
    },
  });

  window._drawView = createDrawView;
  window.__drawViewTest = {
    computeStrokeBounds: computeStrokeBounds,
    computePixelBounds: computePixelBounds,
    computeWorldBounds: computeWorldBounds,
    buildRenderableStrokes: buildRenderableStrokes,
    shouldStartPan: shouldStartPan,
    isUndoShortcut: isUndoShortcut,
    getExportPalette: getExportPalette,
    getPersistedState: getPersistedState,
    mergePersistedState: mergePersistedState,
    resetPersistedState: resetPersistedState,
  };
})();
