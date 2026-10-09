import Image from "next/image";

export function BrandMark() {
  return <Image src="/vaulted-logo.png" alt="Vaulted" width={52} height={52} className="brand-mark" priority />;
}
