function lignesEntete(entete = {}) {
  const contacts = [entete.adresse, entete.telephone, entete.email, entete.site_web]
    .filter(Boolean).join(' · ')
  const details = [
    entete.enseignant && `Enseignant : ${entete.enseignant}`,
    entete.matiere && `Matière(s) : ${entete.matiere}`,
    entete.classe && `Classe : ${entete.classe}`,
    entete.annee && `Année scolaire : ${entete.annee}`,
  ].filter(Boolean)
  return { contacts, details }
}

async function chargerLogoDataUrl(url) {
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Impossible de charger le logo (${response.status}).`)
  const blob = await response.blob()
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = URL.createObjectURL(blob)
  try {
    await image.decode()
    const canvas = document.createElement('canvas')
    const reduction = Math.min(1, 600 / image.naturalWidth, 600 / image.naturalHeight)
    canvas.width = Math.round(image.naturalWidth * reduction)
    canvas.height = Math.round(image.naturalHeight * reduction)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Impossible de préparer le logo pour l’export.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.88)
  } finally {
    URL.revokeObjectURL(image.src)
  }
}

function telecharger(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportToExcel(rows, columns, filename = 'resultats.xlsx', entete = {}) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Résultats')
  const nombreColonnes = Math.max(columns.length, 5)
  const { contacts, details } = lignesEntete(entete)
  const logo = await chargerLogoDataUrl(entete.logoUrl)

  worksheet.columns = Array.from({ length: nombreColonnes }, (_, index) => ({
    width: index < columns.length ? 18 : 14,
  }))
  worksheet.mergeCells(1, 3, 1, nombreColonnes)
  worksheet.mergeCells(2, 3, 2, nombreColonnes)
  worksheet.mergeCells(3, 3, 3, nombreColonnes)
  worksheet.mergeCells(4, 3, 4, nombreColonnes)
  worksheet.mergeCells(5, 3, 5, nombreColonnes)
  worksheet.getCell('C1').value = entete.etablissement || 'Établissement'
  worksheet.getCell('C1').font = { bold: true, size: 18 }
  worksheet.getCell('C2').value = contacts
  worksheet.getCell('C3').value = details[0] || ''
  worksheet.getCell('C4').value = details.slice(1).join(' · ')
  worksheet.getCell('C5').value = entete.titre || 'Résultats scolaires'
  worksheet.getCell('C5').font = { bold: true, size: 14 }
  for (let row = 1; row <= 5; row += 1) worksheet.getRow(row).height = row === 1 ? 28 : 20

  if (logo) {
    const imageId = workbook.addImage({ base64: logo, extension: 'jpeg' })
    worksheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 85 } })
  }

  const headerRow = worksheet.getRow(7)
  headerRow.values = columns.map((column) => column.label)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183A70' } }
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => column.getValue(row) ?? ''))
  })
  worksheet.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: 7 + rows.length, column: columns.length },
  }
  worksheet.views = [{ state: 'frozen', ySplit: 7 }]

  const content = await workbook.xlsx.writeBuffer()
  telecharger(new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename)
}

export async function exportToPDF(title, columns, rows, filename = 'resultats.pdf', entete = {}) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'A4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const colCount = columns.length
  const colWidth = Math.min(45, (pageWidth - 30) / colCount)
  const logo = await chargerLogoDataUrl(entete.logoUrl)
  const { contacts, details } = lignesEntete(entete)

  function dessinerEntete() {
    let texteX = 15
    if (logo) {
      doc.addImage(logo, 'JPEG', 15, 8, 28, 20)
      texteX = 48
    }
    doc.setFontSize(14)
    doc.text(entete.etablissement || 'Établissement', texteX, 13)
    doc.setFontSize(8)
    if (contacts) doc.text(doc.splitTextToSize(contacts, pageWidth - texteX - 15), texteX, 18)
    const lignesDetails = details.length
      ? doc.splitTextToSize(details.join(' · '), pageWidth - 30)
      : []
    if (lignesDetails.length) doc.text(lignesDetails, 15, 29)
    const titreY = 29 + lignesDetails.length * 4 + 4
    doc.setFontSize(12)
    doc.text(title, 15, titreY)
    doc.setDrawColor(160)
    doc.line(15, titreY + 3, pageWidth - 15, titreY + 3)
    return titreY + 7
  }

  let y = dessinerEntete()
  function dessinerColonnes() {
    columns.forEach((col, i) => {
      const x = 15 + i * colWidth
      doc.rect(x, y, colWidth, 8)
      doc.setFontSize(7)
      doc.text(doc.splitTextToSize(String(col.label), colWidth - 2).slice(0, 1), x + 1, y + 5)
    })
    y += 8
  }
  dessinerColonnes()
  rows.forEach((row) => {
    if (y > 185) {
      doc.addPage()
      y = dessinerEntete()
      dessinerColonnes()
    }
    columns.forEach((col, i) => {
      const x = 15 + i * colWidth
      doc.rect(x, y, colWidth, 8)
      doc.setFontSize(7)
      const value = String(col.getValue(row) ?? '')
      doc.text(doc.splitTextToSize(value, colWidth - 2).slice(0, 1), x + 1, y + 5)
    })
    y += 8
  })

  telecharger(doc.output('blob'), filename)
}

function echapperHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caractere])
}

export async function printTable(tableElement, title = 'Document', entete = {}) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Autorise les fenêtres contextuelles pour imprimer ce document.')
  printWindow.opener = null
  const { contacts, details } = lignesEntete(entete)
  const logo = entete.logoUrl
    ? `<img src="${echapperHtml(entete.logoUrl)}" alt="Logo de l’établissement">`
    : ''
  const detailHtml = details.map((detail) => `<span>${echapperHtml(detail)}</span>`).join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>${echapperHtml(title)}</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 18mm; color: #000; }
        .document-header { display: flex; align-items: center; gap: 18px; padding-bottom: 12px; border-bottom: 2px solid #183a70; margin-bottom: 18px; }
        .document-header img { max-width: 120px; max-height: 80px; object-fit: contain; }
        .document-header h1 { margin: 0; font-size: 20px; }
        .document-header p { margin: 4px 0; }
        .document-details { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; }
        h2 { margin: 0 0 1rem; font-size: 18px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
        th { background: #eee; }
        @media print { body { margin: 12mm; } }
      </style>
    </head>
    <body>
      <header class="document-header">
        ${logo}
        <div>
          <h1>${echapperHtml(entete.etablissement || 'Établissement')}</h1>
          ${contacts ? `<p>${echapperHtml(contacts)}</p>` : ''}
          <div class="document-details">${detailHtml}</div>
        </div>
      </header>
      <h2>${echapperHtml(title)}</h2>
      ${tableElement.outerHTML}
    </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  const images = Array.from(printWindow.document.images)
  try {
    await Promise.all(images.map((image) => image.decode()))
  } catch {
    printWindow.close()
    throw new Error('Le logo de l’établissement n’a pas pu être chargé pour l’impression.')
  }
  printWindow.print()
}
