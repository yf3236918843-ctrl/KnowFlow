ChatView.registerType('question', {
  render: function (data) {
    data = data || {};
    var content = data.content || '';
    var html = ''
      + '<div class="question-card">'
      + '  <div class="question-card-head">题目</div>'
      + '  <div class="question-card-body">' + renderMath(esc(content)) + '</div>'
      + '</div>';
    return { html: html, events: null, mount: null };
  },
});
