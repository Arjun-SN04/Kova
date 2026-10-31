import { create } from 'zustand'
import axios from 'axios'
import { api, bizUrl } from './utils'

// Business state shared by the chat screen and the workspace:
// my business profile, the businesses I work for, my own business's settings
// and customer records (for labels and notes in my chat list).
const useBusiness = create((set, get) => ({
  me: null, // { business, status, isAdmin, workFor: [] }
  settings: null, // my own business's settings (owner)
  records: {}, // { customerId: record } for my own business
  alerts: [], // customers waiting too long: [{ business, customer, name, minutes }]

  loadMe: async () => {
    try {
      const res = await axios.get('/api/business/me', api)
      set({ me: res.data })
      if (res.data.business?.enabled) get().loadOwn()
      return res.data
    } catch { return null }
  },

  // My own business's settings and customer records
  loadOwn: async () => {
    try {
      const [overview, customers] = await Promise.all([
        axios.get(bizUrl('me', '/overview'), api),
        axios.get(bizUrl('me', '/customers'), api),
      ])
      const records = {}
      customers.data.customers.forEach((c) => { if (c.record) records[String(c.user._id)] = c.record })
      set({ settings: overview.data.settings, records })
    } catch { /* not a business, or offline */ }
  },

  setSettings: (settings) => set({ settings }),
  setRecord: (record) => record && set((s) => ({ records: { ...s.records, [String(record.customer)]: record } })),
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts.filter((a) => a.customer !== alert.customer), alert] })),
  dismissAlert: (customer) => set((s) => ({ alerts: s.alerts.filter((a) => a.customer !== customer) })),
}))

export default useBusiness
