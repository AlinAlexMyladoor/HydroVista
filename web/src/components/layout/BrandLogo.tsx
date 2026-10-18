import Image from "next/image";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} role="img" aria-label="HydroVista">
      <Image
        src="/hydrovista-logo.svg"
        alt=""
        fill
        sizes="240px"
        priority
        unoptimized
        className="object-contain dark:hidden"
      />
      <Image
        src="/hydrovista-logo-dark.svg"
        alt=""
        fill
        sizes="240px"
        priority
        unoptimized
        className="hidden object-contain dark:block"
      />
    </span>
  );
}
