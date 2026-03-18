import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import Cases from './pages/admin/Cases.jsx';
import Evidence from './pages/admin/Evidence.jsx';
import Blockchain from './pages/admin/Blockchain.jsx';
import Xai from './pages/admin/Xai.jsx';
import ChainOfCustody from './pages/admin/Security.jsx';
import Users from './pages/admin/Users.jsx';
import ActivityLogs from './pages/admin/ActivityLogs.jsx';
import EvidenceXaiView from './pages/admin/EvidenceXaiView.jsx';
import InvestigatorDashboard from './pages/InvestigatorDashboard.jsx';
import UserDashboard from './pages/UserDashboard.jsx';

const App = () => (
  <Routes>
    <Route element={<Landing />} path="/" />
    <Route element={<SignIn />} path="/signin" />
    <Route element={<SignUp />} path="/signup" />
    <Route element={<AdminLayout />} path="/admin">
      <Route element={<AdminDashboard />} index />
      <Route element={<AdminDashboard />} path="dashboard" />
      <Route element={<Cases />} path="cases" />
      <Route element={<Evidence />} path="evidence" />
      <Route element={<Blockchain />} path="blockchain" />
      <Route element={<Xai />} path="xai" />
      <Route element={<ChainOfCustody />} path="chain-of-custody" />
      <Route element={<EvidenceXaiView />} path="cases/:caseId/evidence/:evidenceId/xai" />
      <Route element={<ActivityLogs />} path="activity-logs" />
      <Route element={<Users />} path="users" />
    </Route>
    <Route element={<InvestigatorDashboard />} path="/investigator/dashboard/:accountId" />
    <Route element={<UserDashboard />} path="/user/dashboard/:accountId" />
  </Routes>
);

export default App;
