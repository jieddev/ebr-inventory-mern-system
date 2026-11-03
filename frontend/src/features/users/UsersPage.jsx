import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { getErrorMessage } from '../../api/auth'
import { getUsers } from '../../api/users'
import { costCenterLabel } from '../../utils/costCenters'
import { formatDate } from '../../utils/format'
import { ROLE_LABELS } from '../../utils/roles'
import { permissionShortLabel, permissionsOf } from '../../utils/permissions'
import userPlusIcon from '../../assets/icons/user-plus.svg'
import '../transactions/TransactionsPage.css'
import '../items/ItemsPage.css'
import EditUserPanel from './EditUserPanel'
import './UsersPage.css'

// User management (admin): every account and the cost center each warehouse user and
// encoder works in. Clicking a row opens Edit user, where the cost center is changed.
export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const selectedUser = users?.find((u) => u._id === selectedId)

  useEffect(() => {
    const controller = new AbortController()
    getUsers({ signal: controller.signal })
      .then((list) => {
        setUsers(list)
        setLoadError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(err, 'Could not load the users.'))
      })
    return () => controller.abort()
  }, [reloadKey])

  function handleSaved(saved) {
    setUsers((list) =>
      list.map((u) => (u._id === saved._id ? { ...u, costCenter: saved.costCenter, isActive: saved.isActive } : u)),
    )
    setSelectedId(null)
  }

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <div>
            <h1>User management</h1>
            <p className="users-subtitle">
              Click a user to assign their cost center or disable their account. Admins see every cost center.
            </p>
          </div>
          <Button onClick={() => navigate('/users/new')}>
            <img src={userPlusIcon} alt="" className="users-button-icon" />
            Create user
          </Button>
        </header>

        {loadError && (
          <div className="page-error" role="alert">
            {loadError}
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        )}

        <div className="table-card" aria-busy={!users && !loadError}>
          {users && (
            <div className="items-table-scroll">
              <table className="items-table users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>User ID</th>
                    <th>Role</th>
                    <th>Cost center</th>
                    <th>Permissions</th>
                    <th>Last login</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelected = user._id === selectedId
                    return (
                      <tr
                        key={user._id}
                        className={`users-row ${isSelected ? 'is-selected' : ''} ${user.isActive ? '' : 'is-disabled'}`}
                        tabIndex={0}
                        aria-selected={isSelected}
                        aria-label={`${user.name}, edit user`}
                        onClick={() => setSelectedId(user._id)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.preventDefault()
                          setSelectedId(user._id)
                        }}
                      >
                        <td>{user.name}</td>
                        <td className="items-muted">{user.userId}</td>
                        <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                        <td>
                          {user.role === 'admin' ? (
                            <span className="items-muted">All cost centers</span>
                          ) : user.costCenter ? (
                            <span className="users-cost-center">{costCenterLabel(user.costCenter)}</span>
                          ) : (
                            <span className="items-muted">Not set</span>
                          )}
                        </td>
                        <td className="items-muted">
                          {user.role === 'admin'
                            ? 'Everything'
                            : permissionsOf(user).map(permissionShortLabel).join(', ') || 'None'}
                        </td>
                        <td className="items-muted">{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}</td>
                        <td>
                          <span className={`users-status ${user.isActive ? '' : 'is-disabled'}`}>
                            {user.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!users && !loadError && <p className="users-empty">Loading users…</p>}
        </div>
      </section>

      {selectedUser && <EditUserPanel key={selectedUser._id} user={selectedUser} onClose={() => setSelectedId(null)} onSaved={handleSaved} />}
    </div>
  )
}
