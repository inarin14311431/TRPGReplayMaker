// TRPG glossary presets for accurate AI manuscript editing.
// This is terminology context, NOT an automatic transcript replacement engine.
// Definitions are original summaries; no official rulebook text is reproduced.
const entry = (term, reading, hint) => ({ term, reading, hint });

export const GLOSSARY_PRESETS = Object.freeze([
  {
    id: 'common', label: 'TRPG共通',
    description: 'どのゲームでも使いやすい基本用語。システム固有の名称を勝手に置き換えない。',
    terms: [
      entry('TRPG', 'ティーアールピージー', '会話や判定で物語を進行するテーブルトークRPG'),
      entry('GM', 'ジーエム／ゲームマスター', 'ゲームの進行役。システムによってRL、KP、DMなどとも呼ぶ'),
      entry('PL', 'ピーエル／プレイヤー', '参加者。PCやキャスト本人とは区別する'),
      entry('PC', 'ピーシー／プレイヤーキャラクター', 'PLが担当する作中の人物'),
      entry('NPC', 'エヌピーシー', 'PL以外の作中人物'),
      entry('セッション', 'せっしょん', 'TRPGを実際に遊ぶ時間'),
      entry('シナリオ', 'しなりお', '遊ぶための事件・舞台・出来事の構成'),
      entry('リプレイ', 'りぷれい', '遊んだ内容を読み物としてまとめた記録'),
      entry('ハンドアウト', 'はんどあうと', '参加者やPCに配布する導入情報'),
      entry('シーン', 'しーん', '物語を構成する場面'),
      entry('判定', 'はんてい', '結果をルールに従って決める処理'),
      entry('達成値', 'たっせいち', '判定などで得られた数値。算出方法はゲームごとに違う'),
      entry('難易度', 'なんいど', '成功判定などで参照する基準値'),
      entry('クリティカル', 'くりてぃかる', '判定における特別な成功や有利な結果を示すことがある'),
      entry('ファンブル', 'ふぁんぶる', '判定における特別な失敗や不利な結果を示すことがある'),
      entry('ダイス', 'だいす／サイコロ', 'ゲームで使用する乱数道具'),
      entry('2D6', 'にディーろく', '一般に六面ダイス2個を振る表記'),
      entry('1D100', 'いちディーひゃく／パーセンタイル', '一般に百分率判定などで用いる表記'),
      entry('ロールプレイ', 'ろーるぷれい', '役割になりきって演じること'),
      entry('メタ発言', 'めたはつげん', '作中人物ではなくプレイヤーとして話した内容'),
      entry('卓', 'たく', 'TRPGの遊びの場・参加グループ'),
    ],
  },
  {
    id: 'nova', label: 'トーキョーN◎VA',
    description: 'RL、キャスト、スタイル、神業などの表記を優先。ルール内容は原ログで判断する。',
    terms: [
      entry('トーキョーN◎VA', 'トーキョーノヴァ／N◎VA', 'サイバーパンク世界を舞台とするTRPGのタイトル'),
      entry('RL', 'ルーラー／アールエル', 'アクト進行役。通常のGMに相当する'),
      entry('アクト', 'あくと', 'N◎VAでのセッションや物語'),
      entry('キャスト', 'きゃすと', 'プレイヤーが担当する登場人物'),
      entry('ゲスト', 'げすと', 'RL側の主要な登場人物'),
      entry('エキストラ', 'えきすとら', '主に背景や脇役にあたる登場人物'),
      entry('スタイル', 'すたいる', 'キャストの役割・能力を表す区分'),
      entry('神業', 'しんぎょう', 'スタイルに関係する特別な力。名称・結果を創作しない'),
      entry('スート', 'すーと', 'トランプの絵柄による区分'),
      entry('ペルソナ', 'ぺるそな', 'キャストのスタイルを表す記号◎に関連する概念'),
      entry('キー', 'きー', 'キャストのスタイルを表す記号●に関連する概念'),
      entry('リサーチ', 'りさーち', 'アクトで情報を調べる過程'),
      entry('ニューロエイジ', 'にゅーろえいじ', '世界観を表す呼称'),
      entry('ウェット', 'うぇっと', 'N◎VA固有の文脈がある語。前後の発言を優先する'),
      entry('トーキー', 'とーきー', 'スタイル名称の一つ'),
      entry('フェイト', 'ふぇいと', 'スタイル名称の一つ'),
      entry('クグツ', 'くぐつ', 'スタイル名称の一つ'),
      entry('カブト', 'かぶと', 'スタイル名称の一つ'),
      entry('ニューロ', 'にゅーろ', 'スタイル名称の一つ'),
      entry('アヤカシ', 'あやかし', 'スタイル名称の一つ'),
    ],
  },
  {
    id: 'coc', label: 'クトゥルフ神話TRPG',
    description: '探索者、KP、正気度関連の表記を整える。版による差異には注意する。',
    terms: [
      entry('KP', 'キーパー／ケーピー', '主にゲームを進行する役割'),
      entry('探索者', 'たんさくしゃ', 'プレイヤーが担当する人物'),
      entry('SAN', 'さん／サン', '正気度に関連する表記'),
      entry('正気度', 'しょうきど', '精神の安定状態を扱うゲーム内の数値・概念'),
      entry('正気度ロール', 'しょうきどろーる／サンチェック', '正気度に関連した判定'),
      entry('アイデア', 'あいであ', '判定や能力に用いる呼称。適用は版・状況による'),
      entry('幸運', 'こううん', '判定や能力に用いる呼称。適用は版・状況による'),
      entry('クトゥルフ神話技能', 'くとぅるふしんわぎのう', 'ゲーム固有の技能名'),
      entry('D100', 'でぃーひゃく', '百分率に関連するダイス表記'),
      entry('技能値', 'ぎのうち', '技能の数値'),
    ],
  },
  {
    id: 'dx3', label: 'ダブルクロス The 3rd Edition',
    description: 'オーヴァード、シンドロームなどの名称。判定処理は原文優先。',
    terms: [
      entry('オーヴァード', 'おーゔぁーど／オーバード', '作品固有の超常的な力を持つ人物の呼称'),
      entry('シンドローム', 'しんどろーむ', 'キャラクター能力の系統'),
      entry('UGN', 'ユー・ジー・エヌ', '作品内の組織名'),
      entry('FH', 'エフ・エイチ', '作品内の組織名'),
      entry('ロイス', 'ろいす', '関係性を表すゲーム内の概念'),
      entry('タイタス', 'たいたす', 'ロイスに関連するゲーム内の概念'),
      entry('侵蝕率', 'しんしょくりつ', 'ゲーム内の数値'),
      entry('エフェクト', 'えふぇくと', 'キャラクターの特殊な能力'),
      entry('ワーディング', 'わーでぃんぐ', '作品内の能力名称'),
      entry('リザレクト', 'りざれくと', '作品内の能力名称'),
    ],
  },
  {
    id: 'sw25', label: 'ソード・ワールド2.5',
    description: '冒険者・魔動機などの語。技能と判定はセッションのルールを優先。',
    terms: [
      entry('ソード・ワールド2.5', 'そーどわーるど にーてんご', 'ファンタジーTRPGのタイトル'),
      entry('冒険者', 'ぼうけんしゃ', 'プレイヤーが担当する人物の総称'),
      entry('ガメル', 'がめる', '作品世界の通貨'),
      entry('魔動機', 'まどうき', '作品世界に登場する機械的な存在・技術'),
      entry('蛮族', 'ばんぞく', '世界観で使用される区分'),
      entry('行為判定', 'こういはんてい', 'キャラクターの行動結果を判定する処理'),
      entry('威力表', 'いりょくひょう', '効果などの数値を参照するための表'),
      entry('技能', 'ぎのう', 'キャラクターが修得している能力の区分'),
      entry('戦闘特技', 'せんとうとくぎ', 'ゲーム内の戦闘に関する能力区分'),
      entry('先制判定', 'せんせいはんてい', '戦闘開始時に参照する判定'),
    ],
  },
  {
    id: 'dnd5e', label: 'ダンジョンズ＆ドラゴンズ（5版系）',
    description: 'DM、AC、セーヴなど。採用する版の表記を優先する。',
    terms: [
      entry('D&D', 'ディーアンドディー', 'ダンジョンズ＆ドラゴンズの略称'),
      entry('DM', 'ダンジョンマスター／ディーエム', 'ゲーム進行役'),
      entry('AC', 'アーマー・クラス／エーシー', '攻撃への防御に関係する数値'),
      entry('HP', 'ヒット・ポイント／エイチピー', 'ダメージの管理に関係する数値'),
      entry('イニシアチブ', 'いにしあちぶ', '行動順の決定に用いる概念'),
      entry('セーヴィング・スロー', 'せーゔぃんぐすろー／セーヴ', '危険などへの抵抗を扱う判定'),
      entry('クラス', 'くらす', 'キャラクターの役割・能力系統'),
      entry('呪文スロット', 'じゅもんすろっと', '呪文の使用を管理する仕組み'),
      entry('習熟ボーナス', 'しゅうじゅくぼーなす', '特定の判定などに用いる数値'),
      entry('D20', 'でぃーにじゅう', '二十面ダイスを表す表記'),
    ],
  },
]);

export const GLOSSARY_CHOICES = Object.freeze(['auto', 'none', ...GLOSSARY_PRESETS.map(x => x.id)]);
const BY_ID = new Map(GLOSSARY_PRESETS.map(p => [p.id, p]));
export function inferSystemPreset(systemName) {
  const s = String(systemName || '').normalize('NFKC').toLowerCase().replace(/[\s　・_\-／/]/g, '');
  if (/n◎va|トーキョーノヴァ|tokyonova/.test(s)) return 'nova';
  if (/クトゥルフ|callofcthulhu|coc/.test(s)) return 'coc';
  if (/ダブルクロス|doublecross|dx3/.test(s)) return 'dx3';
  if (/ソードワールド|swordworld|sw2\.?5/.test(s)) return 'sw25';
  if (/ダンジョンズ.*ドラゴンズ|d&d|dungeons.*dragons/.test(s)) return 'dnd5e';
  return null;
}
export function selectedGlossaryPresets(systemName, selection = 'auto') {
  if (!GLOSSARY_CHOICES.includes(selection)) return ['common'];
  if (selection === 'none') return [];
  const id = selection === 'auto' ? inferSystemPreset(systemName) : selection;
  return id && id !== 'common' && BY_ID.has(id) ? ['common', id] : ['common'];
}
export function glossaryForPrompt(systemName, preset = 'auto', custom = '') {
  const ids = selectedGlossaryPresets(systemName, preset);
  const seen = new Set();
  const terms = ids.flatMap(id => (BY_ID.get(id)?.terms || []).filter(t => {
    if (seen.has(t.term)) return false;
    seen.add(t.term);
    return true;
  }));
  const presetLines = terms.map(t => t.term + '（' + t.reading + '）：' + t.hint);
  const customLines = String(custom || '').split(/\r?\n/)
    .map(x => x.trim()).filter(Boolean).slice(0, 120);
  if (!presetLines.length && !customLines.length) return 'なし';
  const prefix = presetLines.length ? '共通・システム別の用語：\n' + presetLines.join('\n') : '';
  const suffix = customLines.length ? '\nアクト独自の表記・読み・補足：\n' + customLines.join('\n') : '';
  return (prefix + suffix).trim().slice(0, 11000);
}
export function glossaryCatalog() {
  return GLOSSARY_PRESETS.map(p => ({
    id: p.id, label: p.label, description: p.description,
    terms: p.terms.map(t => ({ ...t })),
  }));
}
