import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/auth/ProtectedRoute";

import AppLayout from "./components/layout/AppLayout";
import { AuthProvider } from "./context/AuthContext.jsx";
import ApplicationDetails from "./pages/ApplicationDetails";
import MailingContacts from "./pages/MailingContacts";

import MyContacts from "./pages/MyContacts.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";
import Dashboard from "./pages/Dashboard";
import Incoming from "./pages/Incoming";
import Login from "./pages/Login.jsx";
import MailingDetails from "./pages/MailingDetails.jsx";
import Mailings from "./pages/Mailings.jsx";
import ManagerDetails from "./pages/ManagerDetails.jsx";
import Managers from "./pages/Managers";
import Reports from "./pages/Reports.jsx";
import Salaries from "./pages/Salaries.jsx";
import Settings from "./pages/Settings.jsx";
import Users from "./pages/Users.jsx";




import "./styles/global.css";
import "./styles/responsive.css";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
           
            <Route
              path="/"
              element={
                <Navigate to="/dashboard" replace />
              }
            />

            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            <Route
  path="/incoming"
  element={
    <ProtectedRoute
      allowedRoles={[
        "manager",
        "admin",
        "head",
      ]}
    >
      <Incoming />
    </ProtectedRoute>
  }
/>

            <Route
              path="/applications"
              element={<ApplicationsPage />}
            />
            <Route
  path="/applications/:applicationId"
  element={<ApplicationDetails />}
/>

            <Route
  path="/managers"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Managers />
    </ProtectedRoute>
  }
/>
<Route
  path="/my-contacts"
  element={
    <ProtectedRoute
      allowedRoles={[
        "manager",
        "admin",
        "head",
      ]}
    >
      <MyContacts />
    </ProtectedRoute>
  }
/>

            <Route
  path="/managers/:managerId"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <ManagerDetails />
    </ProtectedRoute>
  }
/>

           <Route
  path="/mailings"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Mailings />
    </ProtectedRoute>
  }
/>

         <Route
  path="/mailings/:mailingId"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <MailingDetails />
    </ProtectedRoute>
  }
/>

<Route
  path="/mailings/:mailingId/contacts"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <MailingContacts />
    </ProtectedRoute>
  }
/>

           <Route
  path="/salaries"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Salaries />
    </ProtectedRoute>
  }
/>

            <Route
  path="/reports"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Reports />
    </ProtectedRoute>
  }
/>

           <Route
  path="/users"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Users />
    </ProtectedRoute>
  }
/>
<Route
  path="/settings"
  element={
    <ProtectedRoute
      allowedRoles={["admin", "head"]}
    >
      <Settings />
    </ProtectedRoute>
  }
/>
          </Route>

          <Route
            path="*"
            element={<Navigate to="/dashboard" replace />}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}