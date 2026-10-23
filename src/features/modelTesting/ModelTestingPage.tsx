import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { useNotificationStore } from '@/stores';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Input } from '@/components/ui/Input';
import { IconRefreshCw, IconDownload, IconTrash2, IconCheckCircle2, IconAlertTriangle, IconLoader2, IconSearch } from '@/components/ui/icons';
import { useModelTesting } from './hooks/useModelTesting';
import { useModelTestHistory } from './hooks/useModelTestHistory';
import { getStatusBadgeClass } from './utils';
import styles from './ModelTestingPage.module.scss';

export function ModelTestingPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const { showNotification } = useNotificationStore();

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const {
    models,
    results,
    isLoading,
    isTesting,
    currentTestingModel,
    progress,
    lastTestRun,
    error,
    fetchModels,
    testModel,
    testAllModels,
    testSelectedModels,
    clearResults,
    exportResults,
  } = useModelTesting();

  const { history: savedHistory, refresh: refreshHistory } = useModelTestHistory();

  const handleRefresh = useCallback(async () => {
    await fetchModels();
  }, [fetchModels]);

  useHeaderRefresh(handleRefresh, isCurrentLayer);

  const connected = connectionStatus === 'connected';

  const disableMutations = !connected || isLoading || isTesting;

  const stats = useMemo(() => {
    const working = Object.values(results).filter((r) => r.status === 'working').length;
    const timeout = Object.values(results).filter((r) => r.status === 'timeout').length;
    const error = Object.values(results).filter((r) => r.status === 'error').length;
    const pending = Object.values(results).filter((r) => r.status === 'pending').length;
    return { working, timeout, error, pending, total: models.length };
  }, [results, models.length]);

  const selectedModels = useMemo(() => {
    return new Set(
      Object.entries(results)
        .filter(([, r]) => r.status !== 'pending')
        .map(([id]) => id)
    );
  }, [results]);

  const handleTestAll = useCallback(async () => {
    if (models.length === 0) {
      await fetchModels();
    }
    await testAllModels();
  }, [fetchModels, models.length, testAllModels]);

  const handleTestSelected = useCallback(async () => {
    if (selectedModels.size === 0) {
      showNotification('No models selected', 'warning');
      return;
    }
    await testSelectedModels(Array.from(selectedModels));
  }, [selectedModels, testSelectedModels, showNotification]);

  const handleClear = useCallback(() => {
    clearResults();
  }, [clearResults]);

  const handleExport = useCallback(() => {
    exportResults();
  }, [exportResults]);

  // Loading state
  if (!connected) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <IconAlertTriangle size={48} />
          <h2>{t('modelTesting.notConnected')}</h2>
          <p>{t('modelTesting.connectFirst')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1>{t('modelTesting.title')}</h1>
          <Skeleton width={200} height={40} />
        </div>
        <div className={styles.stats}>
          <Skeleton width={150} height={80} />
          <Skeleton width={150} height={80} />
          <Skeleton width={150} height={80} />
          <Skeleton width={150} height={80} />
        </div>
        <div className={styles.tableWrapper}>
          <Skeleton height={300} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{t('modelTesting.title')}</h1>
        <div className={styles.headerActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            title={t('common.refresh')}
          >
            <IconRefreshCw size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={Object.keys(results).length === 0}>
            <IconDownload size={16} />
            <span>{t('modelTesting.exportCSV')}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={Object.keys(results).length === 0}>
            <IconTrash2 size={16} />
            <span>{t('modelTesting.clearResults')}</span>
          </Button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={`${styles.statCard} ${styles.statTotal}`}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>{t('modelTesting.totalModels')}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statWorking}`}>
          <div className={styles.statValue}>{stats.working}</div>
          <div className={styles.statLabel}>{t('modelTesting.working')}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statTimeout}`}>
          <div className={styles.statValue}>{stats.timeout}</div>
          <div className={styles.statLabel}>{t('modelTesting.timeout')}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statError}`}>
          <div className={styles.statValue}>{stats.error}</div>
          <div className={styles.statLabel}>{t('modelTesting.errors')}</div>
        </div>
      </div>

      {isTesting && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
          />
          <span className={styles.progressText}>
            {t('modelTesting.testingModel', { current: progress.current, total: progress.total, model: currentTestingModel })}
          </span>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <IconAlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <Card className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.searchWrapper}>
            <IconSearch size={16} className={styles.searchIcon} />
            <Input
              placeholder={t('modelTesting.searchPlaceholder')}
              className={styles.searchInput}
              onChange={() => {
                // Filter logic could be added here
              }}
            />
          </div>
          <div className={styles.tableActions}>
            <Button
              variant={selectedModels.size > 0 ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleTestSelected}
              disabled={selectedModels.size === 0 || isTesting}
            >
              {isTesting ? (
                <>
                  <IconLoader2 size={14} className={styles.spinning} />
                  <span>{t('modelTesting.testing')}</span>
                </>
              ) : (
                <>
                  <IconCheckCircle2 size={14} />
                  <span>{t('modelTesting.testSelected', { count: selectedModels.size })}</span>
                </>
              )}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleTestAll}
              disabled={models.length === 0 || isTesting}
            >
              {isTesting ? (
                <>
                  <IconLoader2 size={14} className={styles.spinning} />
                  <span>{t('modelTesting.testing')}</span>
                </>
              ) : (
                <>
                  <IconCheckCircle2 size={14} />
                  <span>{t('modelTesting.testAll', { count: models.length })}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: '100px' }}>{t('modelTesting.status')}</TableHead>
              <TableHead style={{ minWidth: '250px' }}>{t('modelTesting.model')}</TableHead>
              <TableHead style={{ width: '150px' }}>{t('modelTesting.provider')}</TableHead>
              <TableHead style={{ width: '120px' }}>{t('modelTesting.responseTime')}</TableHead>
              <TableHead style={{ width: '180px' }}>{t('modelTesting.lastTested')}</TableHead>
              <TableHead style={{ minWidth: '200px' }}>{t('modelTesting.error')}</TableHead>
              <TableHead style={{ width: '80px' }}>{t('common.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => {
              const result = results[model.id];
              const status = result?.status || 'pending';
              const isCurrentTest = isTesting && currentTestingModel === model.id;

              return (
                <TableRow key={model.id}>
                  <TableCell>
                    <span className={getStatusBadgeClass(status)}>
                      {isCurrentTest ? (
                        <IconLoader2 size={14} className={`${styles.spinning} ${styles.inlineIcon}`} />
                      ) : null}
                      <span>{t(`modelTesting.status.${status}`)}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={styles.modelName} title={model.id}>
                      {model.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    {result?.providerFamily ? (
                      <span className={styles.providerName}>{result.providerFamily}</span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {result?.responseTimeMs !== null && result?.responseTimeMs !== undefined ? (
                      `${result.responseTimeMs}ms`
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {result?.testedAt ? new Date(result.testedAt).toLocaleString() : '-'}
                  </TableCell>
                  <TableCell>
                    {result?.errorMessage ? (
                      <span className={styles.errorText} title={result.errorMessage}>
                        {result.errorMessage}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testModel(model.id, { brand: 'unknown', id: 'unknown', name: '', baseUrl: '', apiKey: '' })}
                      disabled={disableMutations || isTesting}
                      title={t('modelTesting.testSingle')}
                    >
                      <IconCheckCircle2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {models.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className={styles.emptyMessage}>
                  {t('modelTesting.noModels')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {lastTestRun && (
        <Card className={styles.summaryCard}>
          <h3>{t('modelTesting.lastRunSummary')}</h3>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{lastTestRun.working}</span>
              <span className={styles.summaryLabel}>{t('modelTesting.working')}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{lastTestRun.timeout}</span>
              <span className={styles.summaryLabel}>{t('modelTesting.timeout')}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{lastTestRun.error}</span>
              <span className={styles.summaryLabel}>{t('modelTesting.errors')}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>
                {new Date(lastTestRun.timestamp).toLocaleString()}
              </span>
              <span className={styles.summaryLabel}>{t('modelTesting.timestamp')}</span>
            </div>
          </div>
        </Card>
      )}

      {savedHistory.length > 0 && (
        <Card className={styles.historyCard}>
          <div className={styles.historyHeader}>
            <h3>{t('modelTesting.testHistory')}</h3>
            <Button variant="ghost" size="sm" onClick={refreshHistory}>
              <IconRefreshCw size={14} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '180px' }}>{t('modelTesting.timestamp')}</TableHead>
                <TableHead style={{ width: '100px' }}>{t('modelTesting.totalModels')}</TableHead>
                <TableHead style={{ width: '100px' }}>{t('modelTesting.working')}</TableHead>
                <TableHead style={{ width: '100px' }}>{t('modelTesting.timeout')}</TableHead>
                <TableHead style={{ width: '100px' }}>{t('modelTesting.errors')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedHistory.map((entry) => (
                <TableRow key={entry.timestamp}>
                  <TableCell>{new Date(entry.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{entry.totalModels}</TableCell>
                  <TableCell>{entry.working}</TableCell>
                  <TableCell>{entry.timeout}</TableCell>
                  <TableCell>{entry.error}</TableCell>
                </TableRow>
              ))}
              {savedHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className={styles.emptyMessage}>
                    {t('modelTesting.noHistory')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}