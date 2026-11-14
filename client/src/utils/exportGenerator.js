import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../context/AppContext'

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function expenseName(exp) {
  if (!exp) return ''
  const u = exp.paidBy
  if (!u) return ''
  if (typeof u === 'string') return u
  return u.name || u.email || u._id || ''
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

export function downloadCSV(exportJson, filename) {
  const expenses = exportJson?.expenses || []
  const headers = ['Date', 'Title', 'Category', 'Paid By', 'Amount', 'Type', 'Status', 'Split']
  const rows = expenses.map((e) => {
    const split = (e.splitBetween || [])
      .map((s) => {
        const who = typeof s.user === 'object' ? s.user?.name || s.user?._id || '' : s.user || ''
        return `${who}:${s.shareAmount ?? ''}`
      })
      .join('; ')
    return [
      formatDate(e.date || e.createdAt),
      e.title || '',
      e.category || '',
      expenseName(e),
      e.amount ?? '',
      e.type || 'expense',
      e.status || '',
      split
    ]
  })
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'splittrack-export.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function userLabel(u) {
  if (!u) return ''
  if (typeof u === 'string') return u
  return u.name || u.email || u._id || ''
}

export function downloadPDF(exportJson) {
  const doc = new jsPDF()
  const group = exportJson?.group || {}
  const summary = exportJson?.summary || exportJson?.totals || {}
  const expenses = exportJson?.expenses || []
  const settlements = exportJson?.settlements || exportJson?.balances?.settlements || []

  doc.setFontSize(18)
  doc.text(`SplitTrack — ${group.name || 'Expense Report'}`, 14, 18)
  doc.setFontSize(10)
  doc.text(`Exported: ${new Date(exportJson?.exportedAt || Date.now()).toLocaleString()}`, 14, 26)
  if (summary.totalSpent !== undefined || summary.total !== undefined) {
    doc.text(`Total spent: ${summary.totalSpent ?? summary.total ?? ''}`, 14, 32)
  }
  if (summary.totalExpenses !== undefined) {
    doc.text(`Total expenses: ${summary.totalExpenses}`, 14, 38)
  }

  let y = 46
  if (settlements.length > 0) {
    doc.setFontSize(13)
    doc.text('Settlements', 14, y)
    autoTable(doc, {
      startY: y + 4,
      head: [['From', 'To', 'Amount']],
      body: settlements.map((s) => [userLabel(s.from), userLabel(s.to), String(s.amount ?? '')])
    })
    y = doc.lastAutoTable.finalY + 10
  }

  doc.setFontSize(13)
  doc.text('Expenses', 14, y)
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Title', 'Category', 'Paid By', 'Amount', 'Status']],
    body: expenses.map((e) => [
      formatDate(e.date || e.createdAt),
      e.title || '',
      e.category || '',
      expenseName(e),
      String(e.amount ?? ''),
      e.status || ''
    ])
  })

  const safeName = (group.name || 'splittrack').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-expenses.pdf`)
}

export async function fetchExport(groupId, filters = {}) {
  const params = {}
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (filters.category) params.category = filters.category
  if (filters.user) params.user = filters.user
  if (filters.status) params.status = filters.status
  if (filters.type) params.type = filters.type
  if (filters.search) params.search = filters.search
  const res = await api.get(`/groups/${groupId}/expenses/export`, { params })
  return res.data?.data || res.data
}

export default { downloadCSV, downloadPDF, fetchExport }
