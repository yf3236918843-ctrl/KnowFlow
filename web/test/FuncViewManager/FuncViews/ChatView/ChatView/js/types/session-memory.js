ChatView.registerType('session_memory', {
  render: function (data) {
    data = data || {};

    function row(label, content, mode) {
      if (!content) return '';
      var body = mode === 'math' ? renderMath(esc(content)) : esc(content);
      return ''
        + '<div class="sm-row">'
        + '  <div class="sm-label">' + esc(label) + '</div>'
        + '  <div class="sm-content">' + body + '</div>'
        + '</div>';
    }

    var html = ''
      + '<div class="session-memory-card" style="margin:0;">'
      + '  <div class="sm-header">'
      + '    <span>教师会话记忆</span>'
      + '    <span class="sm-arrow">\u25B6</span>'
      + '  </div>'
      + '  <div class="sm-preview">'
      +       esc(data.stu_signal || data.tec_signal || data.session_outline || '本轮没有额外记忆信号')
      + '  </div>'
      + '  <div class="slide-wrap">'
      + '    <div>'
      + '      <div class="sm-body">'
      +            row('会话概览', data.session_outline || '', 'math')
      +          + row('学生信号', data.stu_signal || '', 'math')
      +          + row('教学信号', data.tec_signal || '', 'math')
      +          + row('元信号', data.meta_signal || '', 'math')
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    return {
      html: html,
      events: null,
      mount: function (el) {
        var card = el.querySelector('.session-memory-card');
        var slide = card && card.querySelector('.slide-wrap');
        var arrow = card && card.querySelector('.sm-arrow');
        if (!card || !slide) return;

        card.addEventListener('click', function () {
          var isOpen = slideToggle(slide);
          if (arrow) arrow.textContent = isOpen ? '\u25BC' : '\u25B6';
        });
      },
    };
  },
});
