# Learning Shell Redesign Spec

## Goal

Refit the current `web/test` frontend shell to match the approved visual direction and learning-oriented information architecture:

- sidebar uses hierarchical expandable groups
- project management becomes accordion-based instead of drill-down
- exercise chrome moves path context into the top bar
- question display and input area become lighter and less panel-like

## Approved UX Rules

### Sidebar

- Sidebar is an accordion, not a flat session list.
- Hierarchy:
  - project
  - bank
  - sessions under that `project.bank`
- Multiple accordion groups may stay open simultaneously.
- Open state must persist across reloads.
- Session item title should be the question content itself, with truncation and KaTeX rendering where practical.
- Session item meta should include group name and update time.

### Project Management

- The page becomes a single-page accordion manager instead of click-through drill-down.
- `project` and `bank` rows are high-information rows:
  - left: main identity
  - right: dense summary indicators and row actions
- `group` and `question` rows are lighter.
- Useful information beats decorative emptiness.
- Desktop should feel information-dense and intentional.
- Mobile should reuse the same components with responsive stacking, not a separate implementation.

### Exercise Chrome

- `project / bank / group / question number` moves into the top context bar (`ctxTitle` area).
- The question navigator moves to the top-right chrome area.
- The current `题库题` badge is removed.
- The question display block remains clickable for locating the current question, but should not look like a heavy gray panel.
- Clicking inner content should not visually trigger a whole-block press animation.

### Input Area

- Input area should visually blend into the chat surface.
- Remove the strong separator line / mismatched background feel between chat area and input area.
- Structure should be defined by spacing, focus states, and subtle boundaries rather than obvious slabs of color.

## Data / State Expectations

- Sidebar UI persistence:
  - open project ids
  - open bank ids
  - active sidebar tab
- Exercise chrome still uses current backend contracts:
  - `session.catalog`
  - `question.navigator`
  - `question.path`
  - `exercise.start`
- Project management can derive progress and summary info client-side by combining:
  - `project.list`
  - `bank.list`
  - `group.list`
  - `question.list`
  - `session.catalog`

## Visual Direction

- Reuse the existing dark, developer-tool style already established in the reference `main.html` and `login.html`.
- Avoid decorative filler.
- Prefer thin borders, restrained glow, compact typography hierarchy, and content-driven layout.
- High-density rows should look deliberate, not cluttered.

## Implementation Scope

- `web/test/main.html`
- `web/test/css/sidebar.css`
- `web/test/css/components.css`
- `web/test/css/project-management.css`
- `web/test/FuncViewManager/FuncViews/project-management.view.js`
- `web/test/FuncViewManager/FuncViews/ChatView/Process/exercise/view.js`
- `web/test/FuncViewManager/FuncViews/ChatView/ChatView/css/ChatView.css`
- `web/test/FuncViewManager/FuncViews/ChatView/ChatView/css/input.css`

## Non-Goals For This Pass

- image import agent flow
- backend data model redesign
- preference system redesign
- changing the full exercise workflow protocol
