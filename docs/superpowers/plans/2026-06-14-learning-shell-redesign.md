# Learning Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `web/test` frontend shell so sidebar hierarchy, project management, and exercise chrome match the approved learning-first UI.

**Architecture:** Keep backend contracts mostly unchanged and concentrate the redesign inside the frontend shell and view layer. Use one responsive implementation for desktop and mobile, with state persistence in local storage for sidebar expansion and shell selection.

**Tech Stack:** FastAPI static frontend, vanilla JS, ViewManager, ChatView, CSS files under `web/test/css` and `web/test/FuncViewManager/...`.

---

### Task 1: Rewrite Shell Chrome And Sidebar Hierarchy

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\main.html`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\css\sidebar.css`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\css\components.css`

- [ ] Replace the current flat session rendering with project -> bank -> session accordion rendering.
- [ ] Persist open project ids, open bank ids, and active sidebar tab in local storage.
- [ ] Refit the top context bar so it supports left title content plus right-side actions.
- [ ] Restyle the function list and welcome shortcuts to align with the approved design language.

### Task 2: Rebuild Project Management As Accordion Data Tree

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\project-management.view.js`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\css\project-management.css`

- [ ] Replace drill-down state with tree state that loads projects, banks, groups, questions, and session-derived progress metadata.
- [ ] Render high-density project and bank rows with summary metrics and inline actions.
- [ ] Render lighter group and question rows.
- [ ] Preserve create/edit/delete/import/start actions through dialogs and row controls.

### Task 3: Refine Exercise Chrome

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\Process\exercise\view.js`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\css\ChatView.css`

- [ ] Move path information to the context bar via shell hooks.
- [ ] Move navigator trigger and question progress display into context actions.
- [ ] Simplify `qn-card` so it is a light locating surface instead of a heavy panel.
- [ ] Keep navigator and summary modal behavior intact.

### Task 4: Blend Input Area Into Chat Surface

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\css\input.css`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\css\chat.css`

- [ ] Remove the hard split between chat area and input area.
- [ ] Make input container rely on spacing and subtle edge treatment instead of slab background + divider.
- [ ] Preserve streaming, extras menu, and attachment behavior.

### Task 5: Verify With Syntax Checks, Regression Scripts, And Browser Smoke Test

**Files:**
- Verify only

- [ ] Run JS syntax checks for changed view files.
- [ ] Run existing regression scripts for import/project-management/preference.
- [ ] Run browser smoke test for:
  - sidebar accordion
  - project management layout
  - JSON append import
  - start exercise
  - restored session context bar and navigator
