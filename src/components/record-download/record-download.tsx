import { clickA } from "@/utils/url-params";

interface RecordDownloadProps {
    url: string;
}

export const RecordDownload = ({url}: RecordDownloadProps) => {

    return (
        <>
        {clickA(url)}
        </>
    );
}