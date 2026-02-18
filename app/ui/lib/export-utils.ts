import { DateTime } from "luxon"

export interface ExportColumn {
  key: string
  label: string
  formatter?: (value: any) => string
}

export type ExportFormat = "csv" | "excel" | "pdf"

// Excel export using CSV format with proper MIME type
export const exportToExcel = (
  data: any[],
  columns: ExportColumn[],
  filename?: string
) => {
  if (!data || data.length === 0) {
    console.warn("No data to export")
    return
  }

  // Create CSV headers
  const headers = columns.map(col => col.label)
  
  // Create CSV rows
  const rows = data.map(item => 
    columns.map(col => {
      const value = getNestedValue(item, col.key)
      const formattedValue = col.formatter ? col.formatter(value) : value
      // Escape commas and quotes, and wrap in quotes if needed
      const stringValue = String(formattedValue || "")
      if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    })
  )

  // Combine headers and rows
  const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")

  // Create and download the file
  const blob = new Blob([csvContent], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
  })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  
  const timestamp = DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")
  const defaultFilename = `export-${timestamp}.xlsx`
  
  link.setAttribute("href", url)
  link.setAttribute("download", filename || defaultFilename)
  link.style.visibility = "hidden"
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// PDF export using browser print functionality
export const exportToPDF = (
  data: any[],
  columns: ExportColumn[],
  filename?: string
) => {
  if (!data || data.length === 0) {
    console.warn("No data to export")
    return
  }

  // Create HTML content for PDF
  const headers = columns.map(col => `<th>${col.label}</th>`).join("")
  const rows = data.map(item => 
    columns.map(col => {
      const value = getNestedValue(item, col.key)
      const formattedValue = col.formatter ? col.formatter(value) : value
      return `<td>${String(formattedValue || "")}</td>`
    }).join("")
  ).join("")

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .header { text-align: center; margin-bottom: 30px; }
        .timestamp { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Data Export Report</h1>
        <p>Generated on ${DateTime.now().toFormat("MMM dd, yyyy HH:mm:ss")}</p>
      </div>
      <table>
        <thead>
          <tr>${headers}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="timestamp">
        <p>Total records: ${data.length}</p>
      </div>
    </body>
    </html>
  `

  // Create a new window and print
  const printWindow = window.open("", "_blank")
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  } else {
    console.error("Failed to open print window. Please allow popups for this site.")
  }
}

export const exportToCSV = (
  data: any[],
  columns: ExportColumn[],
  filename?: string
) => {
  if (!data || data.length === 0) {
    console.warn("No data to export")
    return
  }

  // Create CSV headers
  const headers = columns.map(col => col.label)
  
  // Create CSV rows
  const rows = data.map(item => 
    columns.map(col => {
      const value = getNestedValue(item, col.key)
      const formattedValue = col.formatter ? col.formatter(value) : value
      // Escape commas and quotes, and wrap in quotes if needed
      const stringValue = String(formattedValue || "")
      if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    })
  )

  // Combine headers and rows
  const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")

  // Create and download the file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  
  const timestamp = DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")
  const defaultFilename = `export-${timestamp}.csv`
  
  link.setAttribute("href", url)
  link.setAttribute("download", filename || defaultFilename)
  link.style.visibility = "hidden"
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Main export function that supports multiple formats
export const exportData = (
  data: any[],
  columns: ExportColumn[],
  format: ExportFormat,
  filename?: string
) => {
  const timestamp = DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss")
  const baseFilename = filename || `export-${timestamp}`
  
  switch (format) {
    case "excel":
      exportToExcel(data, columns, `${baseFilename}.xlsx`)
      break
    case "pdf":
      exportToPDF(data, columns, `${baseFilename}.pdf`)
      break
    case "csv":
    default:
      exportToCSV(data, columns, `${baseFilename}.csv`)
      break
  }
}

// Helper function to get nested object values
const getNestedValue = (obj: any, path: string) => {
  return path.split(".").reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : ""
  }, obj)
}

// Common formatters
export const formatters = {
  date: (value: string) => {
    if (!value) return ""
    return DateTime.fromISO(value).toFormat("MMM dd, yyyy")
  },
  dateTime: (value: string) => {
    if (!value) return ""
    return DateTime.fromISO(value).toFormat("MMM dd, yyyy HH:mm")
  },
  currency: (value: number) => {
    if (!value) return ""
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(value)
  },
  boolean: (value: boolean) => value ? "Yes" : "No",
  array: (value: any[]) => {
    if (!Array.isArray(value)) return ""
    return value.join(", ")
  },
  department: (value: any) => {
    if (!value) return ""
    if (typeof value === "string") return value
    return value.name || ""
  },
  staffName: (value: any) => {
    if (!value) return ""
    if (typeof value === "string") return value
    return value.name || ""
  }
}
