/**
 * Vietnamese locale configuration for date-fns and MUI DatePicker.
 * Import this when setting up LocalizationProvider with AdapterDateFns.
 *
 * Usage:
 *   import { vi } from 'date-fns/locale'
 *   import { LocalizationProvider } from '@mui/x-date-pickers'
 *   import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
 *
 *   <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={vi}>
 *     ...
 *   </LocalizationProvider>
 *
 * NOTE: Requires @mui/x-date-pickers to be installed.
 */

// Re-export Vietnamese locale from date-fns for convenience
export { vi as viLocale } from 'date-fns/locale'

// Vietnamese date format patterns
export const VI_DATE_FORMATS = {
  short: 'dd/MM/yyyy',
  long: 'dd MMMM yyyy',
  dateTime: 'dd/MM/yyyy HH:mm',
  dateTimeFull: 'EEEE, dd MMMM yyyy HH:mm',
  time: 'HH:mm',
  monthYear: 'MMMM yyyy',
} as const
