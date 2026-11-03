export function tokens(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || []
}

export const STOP = new Set(tokens(
  'a au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me mes moi mon ne nos notre nous on ou par pas pour qu que quelle quel quelles quels qui sa se ses son sur ta te tes toi ton toutes tout un une vos votre vous y est sont est-ce combien comment donne dis explique indique montre quel quelle',
))
