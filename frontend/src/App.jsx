import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/layout/AdminRoute'
import AppLayout from './components/layout/AppLayout'
import HomeRedirect from './components/layout/HomeRedirect'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AuthProvider from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import StatusPage from './features/system/StatusPage'
import TransactionsPage from './features/transactions/TransactionsPage'
import CreateUserPage from './features/users/CreateUserPage'
import ItemsPage from './features/items/ItemsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/status" element={<StatusPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/transactions" element={<TransactionsPage />} />

              <Route element={<AdminRoute />}>
                <Route path="/users/new" element={<CreateUserPage />} />
                <Route path="/items" element={<ItemsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
