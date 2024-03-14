import * as dnd from 'fantasy-content-generator';

import { idConvert } from './handlers';

export const NAT_20 = [
  // Successes
  'https://media.giphy.com/media/meKPRINqUoQXC/giphy.gif',
  'https://media.giphy.com/media/Zw3oBUuOlDJ3W/giphy.gif',
  'https://media.giphy.com/media/b09xElu8in7Lq/giphy.gif',
  'https://media.giphy.com/media/Na33dsU2umStO/giphy.gif',
  'https://media.giphy.com/media/90F8aUepslB84/giphy.gif',
  'https://media.giphy.com/media/rmi45iyhIPuRG/giphy.gif',
  'https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif',
  'https://media.giphy.com/media/fDbzXb6Cv5L56/giphy.gif',
  'https://media.giphy.com/media/3o72FcJmLzIdYJdmDe/giphy.gif',
  'https://media.giphy.com/media/3o7btZTXDFpXjK6d56/giphy.gif',
  'https://media.giphy.com/media/wijMRo7UZXSqA/giphy.gif',
];

export const NAT_1 = [
  // Fails
  'https://media.giphy.com/media/EXHHMS9caoxAA/giphy.gif',
  'https://media.giphy.com/media/QwZ4DVuJpkJZS/giphy.gif',
  'https://media.giphy.com/media/aGc9XBGiP9QqY/giphy.gif',
  'https://media.giphy.com/media/zraj11LOUptNsNDfTv/giphy.gif',
  'https://media.giphy.com/media/duexIlfr9yYwYE23UA/giphy.gif',
  'https://media.giphy.com/media/3ePb1CHEjfSRhn6r3c/giphy.gif',
  'https://media.giphy.com/media/dJEMs13SrsiuA/giphy.gif',
  'https://media.giphy.com/media/i4gLlAUz2IVIk/giphy.gif',
  'https://media.giphy.com/media/EFXGvbDPhLoWs/giphy.gif',
  'https://media.giphy.com/media/ONDEDdacIoNjy/giphy.gif',
  'https://media.giphy.com/media/UEkEipSYMWhoY/giphy.gif',
  'https://media.giphy.com/media/DsNFJLcZGuEAo/giphy.gif',
  'https://media.giphy.com/media/I4fvDjTDt7OWQ/giphy.gif',
  'https://media.giphy.com/media/HlTG1x1rzbTos/giphy.gif',
  'https://media.giphy.com/media/rGrxMSVaKvo2Y/giphy.gif',
  'https://media.giphy.com/media/5yaCPstUOV9Kw/giphy.gif',
  'https://media.giphy.com/media/xTk9ZWZR2J0lNIkkCY/giphy.gif',
  'https://media.giphy.com/media/kDmsG1ei4P1Yc/giphy.gif',
  'https://media.giphy.com/media/rW6CpFhDj9lkc/giphy.gif',
];

export function doRoll(str, userId) {
  var strArray = str.match(/^\d+$/i);
  if (strArray) {
    const max = parseInt(str);
    const num = randomRange(1, max);
    return `${idConvert(userId)} rolls **${num}** (1-${max})`;
  }

  var strArray = str.match(/(DIS|ADV)([-+]\d+)?/i);
  if (strArray) {
    const input = strArray.map(String);
    const lower = input[1].toLowerCase();
    const plus = parseInt(input[2]) || 0;
    const num = randomRange(1, 20);
    const otherNum = randomRange(1, 20);
    let msg = `${idConvert(userId)} rolls`;
    msg += ` *[${num}]* and *[${otherNum}]*`;
    let rolled = 0;
    if (lower.includes('adv')) {
      rolled = num > otherNum ? num : otherNum;
      msg += ` with advantage: **${rolled + plus}**`;
    }
    if (lower.includes('dis')) {
      rolled = num < otherNum ? num : otherNum;
      msg += ` with disadvantage: **${rolled + plus}**`;
    }
    let plusStr = null;
    if (plus !== 0) {
      plusStr = ` ${plus > 0 ? '+ ' : '- '}${Math.abs(plus)}`;
    }
    msg += ` (${lower}${!plusStr ? '' : plusStr.replaceAll(' ', '')})`;
    if (rolled === 1) msg += `\n***Critical Fail!***`;
    if (rolled === 20) msg += `\n***Critical Success!***`;
    return msg;
  }

  var strArray = str.match(/(\d+)?[dD](\d+)?([-+]\d+)?/i);
  if (strArray) {
    const input = strArray.map(String);
    const rolls = parseInt(input[1]) || 1;
    const dice = parseInt(input[2]) || 20;
    const plus = parseInt(input[3]) || 0;
    let msg = `${idConvert(userId)} rolls`;
    const numArray = [];
    for (let i = 0; i < rolls; i++) {
      const num = randomRange(1, dice);
      numArray.push(num);
      msg += i > 0 ? ` + *[${num}]*` : ` *[${num}]*`;
    }
    let plusStr = null;
    if (plus !== 0) {
      numArray.push(plus);
      plusStr = ` ${plus > 0 ? '+ ' : '- '}${Math.abs(plus)}`;
      msg += plusStr;
    }
    const sum = numArray.reduce((a, b) => a + b);
    msg += ` = **${sum}** (${rolls === 1 ? '' : rolls}d${dice}${!plusStr ? '' : plusStr.replaceAll(' ', '')})`;
    if (rolls === 1 && dice === 20 && numArray[0] === 1) msg += `\n***Critical Fail!***`;
    if (rolls === 1 && dice === 20 && numArray[0] === 20) msg += `\n***Critical Success!***`;
    return msg;
  }

  return `Invalid roll (${str})`;
}

export function dndMagicItems() {
  return JSON.stringify(dnd.MagicItems.generate(), undefined, 2);
}

export function dndNpcs() {
  return JSON.stringify(dnd.NPCs.generate(), undefined, 2);
}

export function dndLoots() {
  return JSON.stringify(dnd.Loots.generate(), undefined, 2);
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
