import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import { getAuth } from './auth.js';

import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientForm from './pages/ClientForm.jsx';
import ClientPos from './pages/ClientPos.jsx';
import ClientPoDetail from './pages/ClientPoDetail.jsx';
import ClientPoForm from './pages/ClientPoForm.jsx';
import ClientPoEdit from './pages/ClientPoEdit.jsx';
import ClientInvoices from './pages/ClientInvoices.jsx';
import ClientInvoiceDetail from './pages/ClientInvoiceDetail.jsx';
import ClientInvoiceForm from './pages/ClientInvoiceForm.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';
import VendorPoPrint from './pages/VendorPoPrint.jsx';
import ClientPayments from './pages/ClientPayments.jsx';
import ReceiptForm from './pages/ReceiptForm.jsx';
import CreditNotes from './pages/CreditNotes.jsx';
import CreditNoteForm from './pages/CreditNoteForm.jsx';
import Expenses from './pages/Expenses.jsx';
import ExpenseCategories from './pages/ExpenseCategories.jsx';
import OperatingExpenses from './pages/OperatingExpenses.jsx';
import ReportProfitLoss from './pages/ReportProfitLoss.jsx';

import Vendors from './pages/Vendors.jsx';
import VendorForm from './pages/VendorForm.jsx';
import Products from './pages/Products.jsx';
import VendorPos from './pages/VendorPos.jsx';
import VendorPoDetail from './pages/VendorPoDetail.jsx';
import VendorPoForm from './pages/VendorPoForm.jsx';
import VendorPoEdit from './pages/VendorPoEdit.jsx';
import VendorInvoices from './pages/VendorInvoices.jsx';
import VendorInvoiceDetail from './pages/VendorInvoiceDetail.jsx';
import VendorInvoiceForm from './pages/VendorInvoiceForm.jsx';
import VendorPayments from './pages/VendorPayments.jsx';
import PaymentForm from './pages/PaymentForm.jsx';
import VendorAdvances from './pages/VendorAdvances.jsx';
import AdvanceForm from './pages/AdvanceForm.jsx';
import AdvanceAdjustForm from './pages/AdvanceAdjustForm.jsx';
import DebitNotes from './pages/DebitNotes.jsx';
import DebitNoteForm from './pages/DebitNoteForm.jsx';

import ReportAging from './pages/ReportAging.jsx';
import ReportTax from './pages/ReportTax.jsx';
import ReportPnl from './pages/ReportPnl.jsx';
import ReportReconciliation from './pages/ReportReconciliation.jsx';
import ReportTally from './pages/ReportTally.jsx';
import Treasury from './pages/Treasury.jsx';
import Facilities from './pages/Facilities.jsx';
import TreasuryUpdate from './pages/TreasuryUpdate.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminRoles from './pages/AdminRoles.jsx';
import AdminBackups from './pages/AdminBackups.jsx';
import AdminFinancialYear from './pages/AdminFinancialYear.jsx';
import KeyboardShortcuts from './pages/KeyboardShortcuts.jsx';

export default function App() {
  if (!getAuth()?.token) return <Login />;
  return (
    <Routes>
      {/* Standalone full-page print views (no sidebar) */}
      <Route path="/client-invoices/:id/print" element={<InvoicePrint />} />
      <Route path="/vendor-pos/:id/print" element={<VendorPoPrint />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}

function MainApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />

        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<ClientForm />} />
        <Route path="/clients/:id/edit" element={<ClientForm />} />
        <Route path="/client-pos" element={<ClientPos />} />
        <Route path="/client-pos/new" element={<ClientPoForm />} />
        <Route path="/client-pos/:id/edit" element={<ClientPoEdit />} />
        <Route path="/client-pos/:id" element={<ClientPoDetail />} />
        <Route path="/client-invoices" element={<ClientInvoices />} />
        <Route path="/client-invoices/new" element={<ClientInvoiceForm />} />
        <Route path="/client-invoices/:id" element={<ClientInvoiceDetail />} />
        <Route path="/client-payments" element={<ClientPayments />} />
        <Route path="/client-payments/new" element={<ReceiptForm />} />
        <Route path="/credit-notes" element={<CreditNotes />} />
        <Route path="/credit-notes/new" element={<CreditNoteForm />} />
        <Route path="/expenses" element={<Expenses />} />

        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/new" element={<VendorForm />} />
        <Route path="/vendors/:id/edit" element={<VendorForm />} />
        <Route path="/vendor-pos" element={<VendorPos />} />
        <Route path="/vendor-pos/new" element={<VendorPoForm />} />
        <Route path="/vendor-pos/:id/edit" element={<VendorPoEdit />} />
        <Route path="/vendor-pos/:id" element={<VendorPoDetail />} />
        <Route path="/vendor-invoices" element={<VendorInvoices />} />
        <Route path="/vendor-invoices/new" element={<VendorInvoiceForm />} />
        <Route path="/vendor-invoices/:id" element={<VendorInvoiceDetail />} />
        <Route path="/vendor-payments" element={<VendorPayments />} />
        <Route path="/vendor-payments/new" element={<PaymentForm />} />
        <Route path="/vendor-advances" element={<VendorAdvances />} />
        <Route path="/vendor-advances/new" element={<AdvanceForm />} />
        <Route path="/vendor-advances/adjust" element={<AdvanceAdjustForm />} />
        <Route path="/debit-notes" element={<DebitNotes />} />
        <Route path="/debit-notes/new" element={<DebitNoteForm />} />

        <Route path="/products" element={<Products />} />

        <Route path="/operating-expenses" element={<OperatingExpenses />} />
        <Route path="/expense-categories" element={<ExpenseCategories />} />

        <Route path="/reports/profit-loss" element={<ReportProfitLoss />} />
        <Route path="/reports/aging" element={<ReportAging />} />
        <Route path="/reports/tax" element={<ReportTax />} />
        <Route path="/reports/pnl" element={<ReportPnl />} />
        <Route path="/reports/reconciliation" element={<ReportReconciliation />} />
        <Route path="/reports/tally" element={<ReportTally />} />

        <Route path="/treasury" element={<Treasury />} />
        <Route path="/treasury/facilities" element={<Facilities />} />
        <Route path="/treasury/update" element={<TreasuryUpdate />} />

        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/roles" element={<AdminRoles />} />
        <Route path="/admin/backups" element={<AdminBackups />} />
        <Route path="/admin/financial-year" element={<AdminFinancialYear />} />
        <Route path="/admin/keyboard-shortcuts" element={<KeyboardShortcuts />} />
      </Routes>
    </Layout>
  );
}
