import { AppProvider } from "@/lib/app-state";
import { ProductProvider } from "@/lib/product-state";
import { AppShell } from "@/components/hvac/app-shell";
import { ErrorBoundary } from "@/components/hvac/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <ProductProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </ProductProvider>
    </ErrorBoundary>
  );
}
