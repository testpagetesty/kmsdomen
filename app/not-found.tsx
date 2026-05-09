import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-white">Страна не найдена</h1>
      <p className="text-sm text-gray-400">Проверьте код в адресе или вернитесь к списку.</p>
      <Link href="/" className="text-blue-400 underline hover:text-blue-300">
        На главную
      </Link>
    </div>
  );
}
