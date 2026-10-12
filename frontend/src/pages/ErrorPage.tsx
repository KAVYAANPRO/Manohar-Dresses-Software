import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export default function ErrorPage() {
  const error = useRouteError();

  let title = 'Unexpected Error';
  let message = 'Something went wrong. Please try again.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page Not Found';
      message = "The page you are looking for doesn't exist or has been moved.";
    } else {
      title = `Error ${error.status}`;
      message = (error.data as { message?: string })?.message ?? error.statusText;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full">
        <div className="flex justify-center mb-4 text-red-500">
          <AlertTriangle size={48} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-slate-500 mb-8">{message}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-[#E40043] hover:bg-[#B80037] text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Home size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
