const fs = require('fs');

const CSS_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\css\study-launcher.css`;

function main() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const shellBlockMatch = css.match(/\.sl-select-shell\s*\{([\s\S]*?)\}/);
  if (!shellBlockMatch) {
    throw new Error('missing .sl-select-shell block');
  }
  const shellBlock = shellBlockMatch[1];

  if (/overflow\s*:\s*hidden\s*;/.test(shellBlock)) {
    throw new Error('.sl-select-shell clips the custom dropdown with overflow:hidden');
  }

  const dropdownBlockMatch = css.match(/\.sl-dropdown\s*\{([\s\S]*?)\}/);
  if (!dropdownBlockMatch) {
    throw new Error('missing .sl-dropdown block');
  }
  const dropdownBlock = dropdownBlockMatch[1];
  if (!/position\s*:\s*absolute\s*;/.test(dropdownBlock)) {
    throw new Error('.sl-dropdown must remain absolutely positioned');
  }

  console.log('PASS: study launcher dropdown CSS does not clip custom menu');
}

main();
