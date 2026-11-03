import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Table.module.css";

interface Column<T> {
  header: ReactNode;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  width?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
}

export function Table<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  isLoading,
}: TableProps<T>) {
  if (isLoading) {
    return <div className={styles.loading}>Carregando dados...</div>;
  }

  if (!data?.length) {
    return <div className={styles.empty}>Nenhum registro encontrado.</div>;
  }

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                className={clsx(styles.th, col.className)}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={clsx(styles.tr, onRowClick && styles.clickable)}
            >
              {columns.map((col, index) => (
                <td key={index} className={styles.td}>
                  {typeof col.accessor === "function"
                    ? col.accessor(row)
                    : (row[col.accessor] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
