import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { ToastProvider } from "./lib/toast.tsx";
import { WalletProvider } from "./lib/wallet.tsx";
import { FavoritesProvider } from "./lib/favorites.tsx";
import { ThemeProvider } from "./lib/theme.tsx";
import { ErrorBoundary } from "./components/layout/ErrorBoundary.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>
            <FavoritesProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </FavoritesProvider>
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
