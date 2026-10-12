import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as phosphor from '@phosphor-icons/react';
import { writeFile } from 'node:fs/promises';

const names = ['FloppyDisk', 'Cloud', 'ArrowClockwise', 'ArrowLeft', 'ArrowRight', 'DotsThree', 'Sun', 'Moon', 'SidebarSimple', 'ArrowUpRight', 'BracketsCurly', 'CaretDown', 'Check', 'CheckCircle', 'ClockCounterClockwise', 'Code', 'Columns', 'Copy', 'DownloadSimple', 'EyeSlash', 'FileCode', 'FolderSimple', 'HardDrives', 'Info', 'LockKey', 'MagnifyingGlass', 'Monitor', 'Play', 'Plug', 'Plugs', 'Plus', 'PencilSimple', 'PushPin', 'PushPinSlash', 'ShieldCheck', 'Stack', 'Stop', 'StopCircle', 'TextAlignLeft', 'Trash', 'UserPlus', 'Users', 'WarningCircle', 'Wrench', 'X'];
const icons = Object.fromEntries(names.map(name => [name, renderToStaticMarkup(React.createElement(phosphor[name], { size: 18, weight: 'regular', className: 'icon', 'aria-hidden': true }))]));
await writeFile(new URL('./preview-icons.js', import.meta.url), `/* Generated from the project's Phosphor Icons. */\nwindow.previewIcons = ${JSON.stringify(icons)};\n`);
console.log(`Generated ${names.length} project icons.`);
