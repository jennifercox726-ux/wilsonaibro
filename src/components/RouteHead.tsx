import { Helmet } from "react-helmet-async";

const SITE = "https://wilsonaibro.vercel.app";

interface RouteHeadProps {
  title: string;
  description: string;
  path: string;
}

export default function RouteHead({ title, description, path }: RouteHeadProps) {
  const url = `${SITE}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
    </Helmet>
  );
}
