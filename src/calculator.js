/**
 * ふたりペイ (PairPay) - 計算エンジン
 * 2人の支出・固定費・按分比率に基づく精算計算ロジック
 */

export function calculateSettlement({ expenses, fixedCosts, settings, currentMonth }) {
  const ratioA = (settings.defaultRatioA || 50) / 100;
  const ratioB = (settings.defaultRatioB || 50) / 100;

  // 1. 今月の対象アイテムを抽出（YYYY-MM）
  const monthExpenses = expenses.filter(e => e.date.startsWith(currentMonth));
  
  // 今月有効な固定費
  // 【フィードバック反映】登録月(startMonth)以降、かつ終了月(endMonth)より前の月のみ反映
  const activeFixedCosts = fixedCosts.filter(f => {
    if (f.active === false) return false;
    const start = f.startMonth || '2000-01';
    if (currentMonth < start) return false;
    if (f.endMonth && currentMonth >= f.endMonth) return false;
    return true;
  });

  // 全アイテムを結合（固定費は当月仮想アイテムとして結合）
  const allItems = [
    ...monthExpenses.map(e => ({ ...e, isFixed: false })),
    ...activeFixedCosts.map(f => ({
      id: `fixed_${f.id}`,
      title: f.title,
      amount: Number(f.amount),
      paidBy: f.paidBy,
      category: f.category || 'housing',
      date: `${currentMonth}-01`,
      splitType: f.splitType || 'default',
      customRatioA: f.customRatioA,
      isFixed: true,
      fixedCostId: f.id,
      startMonth: f.startMonth,
      endMonth: f.endMonth
    }))
  ];

  let totalAmount = 0;
  let fixedAmount = 0;
  let variableAmount = 0;

  let totalPaidA = 0;
  let totalPaidB = 0;

  let totalOwedA = 0;
  let totalOwedB = 0;

  const categoryTotals = {};

  for (const item of allItems) {
    const amt = Number(item.amount) || 0;
    totalAmount += amt;

    if (item.isFixed) {
      fixedAmount += amt;
    } else {
      variableAmount += amt;
    }

    if (item.paidBy === 'A') {
      totalPaidA += amt;
    } else {
      totalPaidB += amt;
    }

    let itemRatioA = ratioA;
    let itemRatioB = ratioB;

    if (item.splitType === 'half') {
      itemRatioA = 0.5;
      itemRatioB = 0.5;
    } else if (item.splitType === 'fullA') {
      itemRatioA = 1.0;
      itemRatioB = 0.0;
    } else if (item.splitType === 'fullB') {
      itemRatioA = 0.0;
      itemRatioB = 1.0;
    } else if (item.splitType === 'custom' && item.customRatioA != null) {
      itemRatioA = Number(item.customRatioA) / 100;
      itemRatioB = 1 - itemRatioA;
    }

    const owedA = amt * itemRatioA;
    const owedB = amt * itemRatioB;

    totalOwedA += owedA;
    totalOwedB += owedB;

    const cat = item.category || 'other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
  }

  const balanceA = Math.round(totalPaidA - totalOwedA);
  const balanceB = Math.round(totalPaidB - totalOwedB);

  let needlePosition = 50;
  if (totalAmount > 0) {
    const diffRatio = (balanceB - balanceA) / (totalAmount || 1);
    needlePosition = Math.max(10, Math.min(90, 50 + diffRatio * 35));
  }

  let status = 'even';
  let transferAmount = 0;
  let payerName = '';
  let receiverName = '';
  let payerKey = '';
  let receiverKey = '';

  if (balanceA > 0) {
    status = 'b_to_a';
    transferAmount = balanceA;
    payerName = settings.partnerBName;
    receiverName = settings.partnerAName;
    payerKey = 'B';
    receiverKey = 'A';
  } else if (balanceA < 0) {
    status = 'a_to_b';
    transferAmount = Math.abs(balanceA);
    payerName = settings.partnerAName;
    receiverName = settings.partnerBName;
    payerKey = 'A';
    receiverKey = 'B';
  }

  return {
    month: currentMonth,
    totalAmount,
    fixedAmount,
    variableAmount,
    totalPaidA: Math.round(totalPaidA),
    totalPaidB: Math.round(totalPaidB),
    totalOwedA: Math.round(totalOwedA),
    totalOwedB: Math.round(totalOwedB),
    balanceA,
    balanceB,
    needlePosition,
    status,
    transferAmount,
    payerName,
    receiverName,
    payerKey,
    receiverKey,
    categoryTotals,
    itemCount: allItems.length,
    activeFixedCount: activeFixedCosts.length,
    allItems
  };
}

export function generateShareText({ calculation, settings, monthLabel }) {
  const { status, transferAmount, payerName, receiverName, totalAmount, totalPaidA, totalPaidB, fixedAmount, variableAmount } = calculation;
  
  if (status === 'even') {
    return `🐾【もちもち生活費】${monthLabel}の精算
合計支出は ¥${totalAmount.toLocaleString()} です。
現在はイーブン（精算なし）ですよ。でも幸せならOKです！🐶✨`;
  }

  return `🐾【もちもち生活費】${monthLabel}の精算
━━━━━━━━━━━━━━━
💰【${payerName}】から【${receiverName}】へ
👉 ¥${transferAmount.toLocaleString()} のお支払い
━━━━━━━━━━━━━━━
📊 今月の内訳
・総支出: ¥${totalAmount.toLocaleString()}
  (固定費: ¥${fixedAmount.toLocaleString()} / 変動費: ¥${variableAmount.toLocaleString()})
・${settings.partnerAName}支払済: ¥${totalPaidA.toLocaleString()}
・${settings.partnerBName}支払済: ¥${totalPaidB.toLocaleString()}

比率: ${settings.partnerAName} ${settings.defaultRatioA}% : ${settings.partnerBName} ${settings.defaultRatioB}%
精算よろしくね！わかっていますよ🐾`;
}
