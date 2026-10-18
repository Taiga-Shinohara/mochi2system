/**
 * もちもち犬キャラクターコンポーネント
 * ユーザー提供の公式イラスト（5種）を透過表示＆黒帯キャプション帯を生成
 */

export const MOCHI_CHARACTERS = {
  smile: {
    src: '/characters/mochi-smile.png',
    alt: 'にっこりもちもち犬',
    defaultCaption: 'でも幸せならOKです'
  },
  calm: {
    src: '/characters/mochi-calm.png',
    alt: 'すまし顔もちもち犬',
    defaultCaption: 'わかっていますよ'
  },
  stretch: {
    src: '/characters/mochi-stretch.png',
    alt: 'のびのびもちもち犬',
    defaultCaption: 'みょ〜〜〜〜〜ん'
  },
  sad: {
    src: '/characters/mochi-sad.png',
    alt: '困り顔もちもち犬',
    defaultCaption: '世知辛い'
  },
  panic: {
    src: '/characters/mochi-panic.png',
    alt: '焦るもちもち犬',
    defaultCaption: 'あと30分…あと30分…'
  }
};

/**
 * 添付イラスト画像を使ったもちもち犬の表示
 */
export function renderMochiDog(pose = 'calm', size = 130, className = '') {
  const char = MOCHI_CHARACTERS[pose] || MOCHI_CHARACTERS.calm;
  const isStretch = pose === 'stretch';
  const width = isStretch ? Math.round(size * 0.75) : size;
  const height = 'auto';

  return `
    <img 
      src="${char.src}" 
      alt="${char.alt}" 
      class="mochi-dog-img ${className}" 
      style="width: ${width}px; height: ${height}; max-height: ${size * 1.2}px; object-fit: contain; pointer-events: none; user-select: none;"
    />
  `;
}

/**
 * design.md 6.1 キャプション帯（黒帯＋白文字直角）
 */
export function renderCaption(text) {
  return `<div class="caption-band">${text}</div>`;
}
