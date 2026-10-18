/**
 * もちもち犬キャラクターコンポーネント
 * design.md に完全準拠したSVGイラストレーション＆黒帯キャプション帯
 */

export function renderMochiDog(pose = 'round', size = 120, className = '') {
  // 焼き色の共通グラデーション定義
  const defs = `
    <defs>
      <!-- 頭頂の焼き色にじみ -->
      <radialGradient id="yakiTop" cx="50%" cy="15%" r="35%">
        <stop offset="0%" stop-color="#F2B34C" stop-opacity="0.9" />
        <stop offset="50%" stop-color="#F7CF85" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#FBF6E9" stop-opacity="0" />
      </radialGradient>
      <!-- ほっぺの焼き色にじみ (左) -->
      <radialGradient id="yakiCheekL" cx="30%" cy="60%" r="20%">
        <stop offset="0%" stop-color="#F7CF85" stop-opacity="0.9" />
        <stop offset="60%" stop-color="#FBF6E9" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#FBF6E9" stop-opacity="0" />
      </radialGradient>
      <!-- ほっぺの焼き色にじみ (右) -->
      <radialGradient id="yakiCheekR" cx="70%" cy="60%" r="20%">
        <stop offset="0%" stop-color="#F7CF85" stop-opacity="0.9" />
        <stop offset="60%" stop-color="#FBF6E9" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#FBF6E9" stop-opacity="0" />
      </radialGradient>
      <!-- 手描き風フィルター（少し揺らぎ） -->
      <filter id="handDrawn" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="1" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
      </filter>
    </defs>
  `;

  if (pose === 'smile') {
    // にっこり（精算完了・満足）
    return `
      <svg class="mochi-dog-svg ${className}" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${defs}
        <g filter="url(#handDrawn)">
          <!-- 体（下に向かって広がるお餅シルエット） -->
          <path d="M 50 14 C 28 14 20 32 18 56 C 16 75 22 88 50 88 C 78 88 84 75 82 56 C 80 32 72 14 50 14 Z" 
                fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
          
          <!-- 焼き色（頭頂） -->
          <ellipse cx="50" cy="22" rx="16" ry="10" fill="url(#yakiTop)" />
          <!-- 焼き色（ほっぺ濃いめ） -->
          <circle cx="32" cy="58" r="10" fill="url(#yakiCheekL)" />
          <circle cx="68" cy="58" r="10" fill="url(#yakiCheekR)" />

          <!-- 耳（小さな三角・揺らぎ） -->
          <path d="M 32 20 C 26 13 22 21 27 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <path d="M 68 20 C 74 13 78 21 73 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />

          <!-- 顔: にっこり細めた目 (⌒ ⌒) -->
          <path d="M 36 50 Q 42 44 46 50" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" fill="none" />
          <path d="M 54 50 Q 58 44 64 50" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" fill="none" />

          <!-- 口: ちいさな「ω」または微笑み -->
          <path d="M 47 57 Q 50 60 53 57" stroke="#1A1A1A" stroke-width="2.4" stroke-linecap="round" fill="none" />
          <circle cx="50" cy="53" r="1.5" fill="#1A1A1A" />
        </g>
      </svg>
    `;
  }

  if (pose === 'tilt') {
    // 首かしげ（どちらが払うか考えている・傾き時）
    return `
      <svg class="mochi-dog-svg ${className}" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${defs}
        <g transform="rotate(-8 50 50)" filter="url(#handDrawn)">
          <path d="M 50 14 C 28 14 20 32 18 56 C 16 75 22 88 50 88 C 78 88 84 75 82 56 C 80 32 72 14 50 14 Z" 
                fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
          <ellipse cx="50" cy="22" rx="15" ry="9" fill="url(#yakiTop)" />
          <circle cx="33" cy="58" r="9" fill="url(#yakiCheekL)" />
          <circle cx="67" cy="58" r="9" fill="url(#yakiCheekR)" />
          <path d="M 32 20 C 26 13 22 21 27 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <path d="M 68 20 C 74 13 78 21 73 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <!-- 点の目（少し大きめ・きょとん） -->
          <ellipse cx="40" cy="49" rx="2.4" ry="2.8" fill="#1A1A1A" />
          <ellipse cx="60" cy="48" rx="2.4" ry="2.8" fill="#1A1A1A" />
          <circle cx="50" cy="53" r="1.5" fill="#1A1A1A" />
          <path d="M 48 57 Q 50 59 52 57" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" fill="none" />
        </g>
      </svg>
    `;
  }

  if (pose === 'calm') {
    // すまし顔（「わかっていますよ」）
    return `
      <svg class="mochi-dog-svg ${className}" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${defs}
        <g filter="url(#handDrawn)">
          <path d="M 50 14 C 28 14 20 32 18 56 C 16 75 22 88 50 88 C 78 88 84 75 82 56 C 80 32 72 14 50 14 Z" 
                fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
          <ellipse cx="50" cy="22" rx="16" ry="10" fill="url(#yakiTop)" />
          <circle cx="32" cy="58" r="8" fill="url(#yakiCheekL)" />
          <circle cx="68" cy="58" r="8" fill="url(#yakiCheekR)" />
          <path d="M 32 20 C 26 13 22 21 27 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <path d="M 68 20 C 74 13 78 21 73 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <!-- 閉じ目 (- -) すまし顔 -->
          <line x1="37" y1="50" x2="45" y2="50" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round" />
          <line x1="55" y1="50" x2="63" y2="50" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round" />
          <circle cx="50" cy="53" r="1.5" fill="#1A1A1A" />
          <path d="M 48 57 Q 50 59 52 57" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" fill="none" />
        </g>
      </svg>
    `;
  }

  if (pose === 'stretch') {
    // のびのび（みょ〜〜〜んと縦長）
    return `
      <svg class="mochi-dog-svg ${className}" width="${size * 0.7}" height="${size * 1.3}" viewBox="0 0 70 130" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${defs}
        <g filter="url(#handDrawn)">
          <!-- 縦に伸びた餅シルエット -->
          <path d="M 35 10 C 20 10 16 28 15 65 C 14 100 18 120 35 120 C 52 120 56 100 55 65 C 54 28 50 10 35 10 Z" 
                fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
          <ellipse cx="35" cy="18" rx="12" ry="7" fill="url(#yakiTop)" />
          <circle cx="22" cy="55" r="7" fill="url(#yakiCheekL)" />
          <circle cx="48" cy="55" r="7" fill="url(#yakiCheekR)" />
          <path d="M 22 15 C 17 9 14 16 18 21" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <path d="M 48 15 C 53 9 56 16 52 21" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
          <!-- 点の目 -->
          <circle cx="28" cy="46" r="2.2" fill="#1A1A1A" />
          <circle cx="42" cy="46" r="2.2" fill="#1A1A1A" />
          <circle cx="35" cy="50" r="1.5" fill="#1A1A1A" />
          <path d="M 33 54 Q 35 56 37 54" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" fill="none" />
        </g>
      </svg>
    `;
  }

  // デフォルト: まん丸（基本）
  return `
    <svg class="mochi-dog-svg ${className}" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <g filter="url(#handDrawn)">
        <path d="M 50 14 C 28 14 20 32 18 56 C 16 75 22 88 50 88 C 78 88 84 75 82 56 C 80 32 72 14 50 14 Z" 
              fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
        <ellipse cx="50" cy="22" rx="16" ry="10" fill="url(#yakiTop)" />
        <circle cx="32" cy="58" r="9" fill="url(#yakiCheekL)" />
        <circle cx="68" cy="58" r="9" fill="url(#yakiCheekR)" />
        <path d="M 32 20 C 26 13 22 21 27 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
        <path d="M 68 20 C 74 13 78 21 73 27" fill="#FBF6E9" stroke="#1A1A1A" stroke-width="2.6" stroke-linecap="round" />
        <!-- 小さな点の目、小さな口 -->
        <circle cx="39" cy="48" r="2.4" fill="#1A1A1A" />
        <circle cx="61" cy="48" r="2.4" fill="#1A1A1A" />
        <circle cx="50" cy="52" r="1.5" fill="#1A1A1A" />
        <path d="M 47 56 Q 50 58 53 56" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" fill="none" />
      </g>
    </svg>
  `;
}

/**
 * design.md 6.1 キャプション帯（黒帯＋白文字直角）
 */
export function renderCaption(text) {
  return `<div class="caption-band">${text}</div>`;
}
