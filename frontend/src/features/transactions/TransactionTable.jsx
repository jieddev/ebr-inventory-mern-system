import Badge from '../../components/ui/Badge'
import chevronDown from '../../assets/icons/chevron-down-sm.svg'
import chevronRight from '../../assets/icons/chevron-right-sm.svg'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import './TransactionTable.css'

export default function TransactionTable({ groups, collapsed, expandedEntries, loadingAll, onToggle, onViewAll, onShowLess }) {
  return (
    <div className="txn-table" role="table" aria-label="Transactions grouped by item">
      <div className="txn-row txn-header" role="row">
        <span className="txn-col-main" role="columnheader">
          Item code / Date
        </span>
        <span className="txn-col-customer" role="columnheader">
          Customer name
        </span>
        <span className="txn-col-type" role="columnheader">
          Transaction type
        </span>
        <span className="txn-col-qty" role="columnheader">
          Quantity
        </span>
        <span className="txn-col-balance" role="columnheader">
          Ending balance
        </span>
      </div>

      {groups.map(({ item, entries }) => {
        const id = item._id
        const isCollapsed = collapsed.has(id)
        const allEntries = expandedEntries.get(id)
        const shown = allEntries ?? entries
        const canViewAll = !allEntries && item.transactionCount > entries.length
        const details = [item.brand, item.typeDesign].filter(Boolean).join(' · ')

        return (
          <div key={id} className="txn-group" role="rowgroup">
            <div className="txn-row txn-group-row" role="row">
              <div className="txn-group-item" role="cell">
                <button
                  type="button"
                  className="txn-toggle"
                  onClick={() => onToggle(id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${item.code}`}
                >
                  <img src={isCollapsed ? chevronRight : chevronDown} alt="" width="16" height="16" />
                </button>
                <span className="txn-group-code">{item.code}</span>
                {details && <span className="txn-group-details">{details}</span>}
              </div>
              <div className="txn-group-meta" role="cell">
                <span>
                  {pluralize(item.transactionCount, 'transaction')}
                  {isCollapsed && item.lastTransactionDate && ` · Last on ${formatDate(item.lastTransactionDate)}`}
                </span>
                {!isCollapsed && canViewAll && (
                  <button type="button" className="txn-link" onClick={() => onViewAll(id)} disabled={loadingAll === id}>
                    {loadingAll === id ? 'Loading…' : 'View all'}
                  </button>
                )}
                {!isCollapsed && allEntries && allEntries.length > entries.length && (
                  <button type="button" className="txn-link" onClick={() => onShowLess(id)}>
                    Show less
                  </button>
                )}
              </div>
              <span className="txn-col-balance txn-group-balance" role="cell">
                {formatNumber(item.balance)}
              </span>
            </div>

            {!isCollapsed &&
              shown.map((entry) => (
                <div key={entry._id} className="txn-row txn-entry-row" role="row">
                  <div className="txn-col-main txn-entry-date" role="cell">
                    <span className="txn-guide" aria-hidden="true" />
                    {formatDate(entry.date)}
                  </div>
                  <span className="txn-col-customer txn-entry-customer" role="cell" title={entry.customerName}>
                    {entry.customerName || '—'}
                  </span>
                  <span className="txn-col-type" role="cell">
                    <Badge kind={entry.type} />
                  </span>
                  <span className="txn-col-qty" role="cell">
                    {formatNumber(entry.quantity)}
                  </span>
                  <span
                    className={`txn-col-balance ${entry.endingBalance < 0 ? 'is-negative' : ''}`}
                    role="cell"
                  >
                    {formatNumber(entry.endingBalance)}
                  </span>
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
