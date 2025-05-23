import React from 'react';
import { currentDriver } from '../../../dataSources';
import { OrderBy, makeOrderBy } from '../utils/v1QueryUtils';
import requestAction from '../../../utils/requestAction';
import { Dispatch } from '../../../types';
import endpoints from '../../../Endpoints';
import {
  makeFilterState,
  SetFilterState,
  ValueFilter,
  makeValueFilter,
  Filter,
  RunQuery,
} from './types';

import { Nullable } from '../utils/tsUtils';
import { QualifiedTable } from '../../../metadata/types';
import {
  getScheduledEvents,
  getEventInvocations,
  getScheduledEventTrigger,
  getEventTriggerInvocation,
} from '../../../metadata/queryUtils';
import { EventKind } from '../../Services/Events/types';
import { isNotDefined } from '../utils/jsUtils';

const defaultFilter = makeValueFilter('', null, '');
const defaultSort = makeOrderBy('created_at', 'asc', 'last');
const defaultState = makeFilterState([defaultFilter], [defaultSort], 10, 0);

export type TriggerOperation = 'pending' | 'processed' | 'invocation';

export const useFilterQuery = (
  table: QualifiedTable,
  dispatch: Dispatch,
  presets: {
    filters: Filter[];
    sorts: OrderBy[];
  },
  relationships: Nullable<string[]>,
  triggerOp: TriggerOperation,
  triggerType: EventKind,
  triggerName?: string,
  currentSource?: string
) => {
  const [state, setState] = React.useState(defaultState);
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  const runQuery: RunQuery = (runQueryOpts = {}) => {
    setLoading(true);
    setError(false);

    const { offset, limit, sorts: newSorts } = runQueryOpts;

    const offsetValue = isNotDefined(offset) ? state.offset : offset;
    const limitValue = isNotDefined(limit) ? state.limit : limit;
    const sortsValue = newSorts ?? state.sorts;

    let query = {};
    const endpoint = endpoints.metadata;

    if (triggerType === 'scheduled') {
      if (triggerOp !== 'invocation') {
        query = getScheduledEvents(
          'one_off',
          limitValue ?? 10,
          offsetValue ?? 0,
          triggerOp,
          undefined,
          sortsValue
        );
      } else {
        query = getEventInvocations(
          'one_off',
          limitValue ?? 10,
          offsetValue ?? 0,
          undefined
        );
      }
    } else if (triggerType === 'cron') {
      if (triggerOp !== 'invocation') {
        query = getScheduledEvents(
          'cron',
          limitValue ?? 10,
          offsetValue ?? 0,
          triggerOp,
          triggerName,
          sortsValue
        );
      } else {
        query = getEventInvocations(
          'cron',
          limitValue ?? 10,
          offsetValue ?? 0,
          triggerName
        );
      }
    } else if (triggerType === 'data') {
      if (triggerName) {
        if (triggerOp !== 'invocation') {
          query = getScheduledEventTrigger(
            currentDriver,
            triggerName,
            triggerOp,
            currentSource ?? 'default',
            limitValue,
            offsetValue
          );
        } else {
          query = getEventTriggerInvocation(
            currentDriver,
            triggerName,
            currentSource ?? 'default',
            limitValue,
            offsetValue
          );
        }
      }
    }

    const options = {
      method: 'POST',
      body: JSON.stringify(query),
    };

    dispatch(
      requestAction(endpoint, options, undefined, undefined, true, true)
    ).then(
      (data: any) => {
        if (triggerType === 'data') {
          setRows(data ?? []);
        } else if (triggerOp !== 'invocation') {
          setRows(data?.events ?? []);
        } else {
          setRows(data?.invocations ?? []);
        }

        setLoading(false);
        if (offset !== undefined) {
          setState(s => ({ ...s, offset }));
        }
        if (limit !== undefined) {
          setState(s => ({ ...s, limit }));
        }
        if (newSorts) {
          setState(s => ({
            ...s,
            sorts: newSorts,
          }));
        }
      },
      () => {
        setError(true);
        setLoading(false);
      }
    );
  };

  React.useEffect(() => {
    runQuery();
  }, []);

  const setter: SetFilterState = {
    sorts: (sorts: OrderBy[]) => {
      const newSorts = [...sorts];
      if (!sorts.some(s => s.column === 'created_at')) {
        newSorts.push(makeOrderBy('created_at', 'asc', 'last'));
      }
      setState(s => ({
        ...s,
        sorts: newSorts,
      }));
    },
    filters: (filters: ValueFilter[]) => {
      const newFilters = [...filters];
      if (
        !filters.length ||
        filters[filters.length - 1].value ||
        filters[filters.length - 1].key
      ) {
        newFilters.push(defaultFilter);
      }
      setState(s => ({
        ...s,
        filters: newFilters,
      }));
    },
    offset: (o: number) => {
      setState(s => ({
        ...s,
        offset: o,
      }));
    },
    limit: (l: number) => {
      setState(s => ({
        ...s,
        limit: l,
      }));
    },
  };

  return {
    rows,
    loading,
    error,
    runQuery,
    state,
    setState: setter,
  };
};
