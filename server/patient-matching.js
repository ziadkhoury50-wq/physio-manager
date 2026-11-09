const noise = new Set(
  'dr doctor mr mrs ms physio physiotherapy therapy session appointment assessment initial follow up followup rehabilitation rehab review treatment consultation new patient visit evaluation appt with for checkup موعد جلسة علاج فيزيو تقييم متابعة shoulder knee back neck pain am pm'.split(
    ' ',
  ),
)
const relatives = new Set(
  'mother father daughter son wife husband sister brother parent cousin relative family ام اب اخت اخ زوج زوجة ابن بنت عائلة'.split(
    ' ',
  ),
)
export function normalizeName(text = '') {
  return text
    .slice(0, 2000)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ـ/gu, '')
    .replace(/['’]/gu, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = old
    }
  }
  return row[b.length]
}
const oneEdit = (a, b) => Math.abs(a.length - b.length) <= 1 && distance(a, b) === 1
export function matchAppointment(title, patients) {
  const allWords = normalizeName(title).split(' ').filter(Boolean)
  const words = allWords.filter((w) => !noise.has(w))
  const candidates = []
  for (const patient of patients) {
    if (patient.archived) continue
    const name = normalizeName(patient.name)
      .split(' ')
      .filter((word) => word && !['dr', 'doctor', 'mr', 'mrs', 'ms'].includes(word))
    if (name.length < 2 || name[0].length < 2 || name.at(-1).length < 2) continue
    const first = name[0],
      last = name.at(-1)
    const firstExact = words.includes(first),
      lastExact = words.includes(last)
    let score = 0,
      reason = ''
    if (
      firstExact &&
      lastExact &&
      (first !== last || words.filter((w) => w === first).length >= 2)
    ) {
      score = name.every((w) => words.includes(w)) ? 1 : 0.97
      reason = score === 1 ? 'Full name matches' : 'First and last names match'
    } else {
      const firstTypo = first.length >= 5 && words.some((w) => w.length >= 5 && oneEdit(w, first))
      const lastTypo = last.length >= 5 && words.some((w) => w.length >= 5 && oneEdit(w, last))
      if ((firstExact && lastTypo) || (lastExact && firstTypo)) {
        score = 0.95
        reason = 'One small spelling difference'
      } else if (firstExact || lastExact) {
        score = 0.76
        reason = 'Only part of the name matches'
      }
    }
    if (score) candidates.push({ patient_id: patient.id, name: patient.name, score, reason })
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const best = candidates[0],
    second = candidates[1]
  // Unknown name-like words, family references and competing matches always require review.
  const bestName = best ? normalizeName(best.name).split(' ') : []
  const unexplained = words.filter(
    (w) =>
      !bestName.includes(w) &&
      !bestName.some((n) => n.length >= 5 && w.length >= 5 && oneEdit(n, w)),
  )
  const automatic = Boolean(
    best &&
    best.score >= 0.95 &&
    (!second || best.score - second.score >= 0.12) &&
    !allWords.some((w) => relatives.has(w)) &&
    unexplained.length === 0,
  )
  return { patient_id: automatic ? best.patient_id : null, candidates: candidates.slice(0, 3) }
}
