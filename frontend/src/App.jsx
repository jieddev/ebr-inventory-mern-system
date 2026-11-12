import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/layout/AdminRoute'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import PermissionRoute from './components/layout/PermissionRoute'
import AuthProvider from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import StatusPage from './features/system/StatusPage'
import TransactionsPage from './features/transactions/TransactionsPage'
import CreateUserPage from './features/users/CreateUserPage'
import UsersPage from './features/users/UsersPage'
import ItemsPage from './features/items/ItemsPage'
import ActivityPage from './features/audit/ActivityPage'
import DashboardPage from './features/dashboard/DashboardPage'
import DailyReportPage from './features/reports/DailyReportPage'
import ReportsPage from './features/reports/ReportsPage'
import TransactionReportPage from './features/reports/TransactionReportPage'
import ReservationsPage from './features/reservations/ReservationsPage'
import ReconcilePage from './features/reconcile/ReconcilePage'
import { REPORT_PERMISSIONS } from './utils/permissions'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/status" element={<StatusPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route element={<PermissionRoute permission="addTransactions" />}>
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/reservations" element={<ReservationsPage />} />
              </Route>
              <Route element={<PermissionRoute permission={REPORT_PERMISSIONS} />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
              <Route element={<PermissionRoute permission="viewDailyReport" />}>
                <Route path="/reports/daily" element={<DailyReportPage />} />
              </Route>
              <Route element={<PermissionRoute permission="viewTransactionReport" />}>
                <Route path="/reports/transactions" element={<TransactionReportPage />} />
              </Route>
              <Route element={<PermissionRoute permission="reconcile" />}>
                <Route path="/reconcile" element={<ReconcilePage />} />
              </Route>
              <Route element={<PermissionRoute permission="viewItems" />}>
                <Route path="/items" element={<ItemsPage />} />
              </Route>

              <Route element={<AdminRoute />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/new" element={<CreateUserPage />} />
                <Route path="/activity" element={<ActivityPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
