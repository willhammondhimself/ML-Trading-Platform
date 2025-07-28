import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number; // Number of items to render outside visible area
  enableSmoothScrolling?: boolean;
}

interface VirtualScrollReturn<T> {
  virtualItems: Array<{
    index: number;
    item: T;
    style: React.CSSProperties;
  }>;
  totalHeight: number;
  scrollElementProps: {
    ref: React.RefObject<HTMLElement>;
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export function useVirtualScrolling<T>(
  items: T[],
  options: VirtualScrollOptions
): VirtualScrollReturn<T> {
  const {
    itemHeight,
    containerHeight,
    overscan = 5,
    enableSmoothScrolling = true,
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLElement>(null);

  // Calculate visible range
  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    const itemCount = items.length;
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / itemHeight),
      itemCount - 1
    );

    return {
      startIndex: Math.max(0, visibleStart - overscan),
      endIndex: Math.min(itemCount - 1, visibleEnd + overscan),
      totalHeight: itemCount * itemHeight,
    };
  }, [items.length, scrollTop, itemHeight, containerHeight, overscan]);

  // Generate virtual items
  const virtualItems = useMemo(() => {
    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (items[i] !== undefined) {
        result.push({
          index: i,
          item: items[i],
          style: {
            position: 'absolute' as const,
            top: i * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight,
          },
        });
      }
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight]);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget;
    setScrollTop(element.scrollTop);
  }, []);

  // Scroll to specific index
  const scrollToIndex = useCallback((
    index: number,
    align: 'start' | 'center' | 'end' = 'start'
  ) => {
    if (!scrollElementRef.current) return;

    const element = scrollElementRef.current;
    let targetScrollTop: number;

    switch (align) {
      case 'start':
        targetScrollTop = index * itemHeight;
        break;
      case 'center':
        targetScrollTop = index * itemHeight - containerHeight / 2 + itemHeight / 2;
        break;
      case 'end':
        targetScrollTop = index * itemHeight - containerHeight + itemHeight;
        break;
    }

    // Clamp to valid range
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, totalHeight - containerHeight));

    if (enableSmoothScrolling) {
      element.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    } else {
      element.scrollTop = targetScrollTop;
    }
  }, [itemHeight, containerHeight, totalHeight, enableSmoothScrolling]);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    if (!scrollElementRef.current) return;
    
    if (enableSmoothScrolling) {
      scrollElementRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } else {
      scrollElementRef.current.scrollTop = 0;
    }
  }, [enableSmoothScrolling]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!scrollElementRef.current) return;
    
    const targetScrollTop = totalHeight - containerHeight;
    
    if (enableSmoothScrolling) {
      scrollElementRef.current.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    } else {
      scrollElementRef.current.scrollTop = targetScrollTop;
    }
  }, [totalHeight, containerHeight, enableSmoothScrolling]);

  // Props for scroll container
  const scrollElementProps = {
    ref: scrollElementRef,
    onScroll: handleScroll,
    style: {
      height: containerHeight,
      overflow: 'auto',
      position: 'relative' as const,
    },
  };

  return {
    virtualItems,
    totalHeight,
    scrollElementProps,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
  };
}

// Specialized hook for trading data virtual scrolling
interface TradingVirtualScrollOptions extends Omit<VirtualScrollOptions, 'itemHeight'> {
  itemHeight?: number;
  stickyHeader?: boolean;
  autoScrollToLatest?: boolean;
}

export function useTradingVirtualScroll<T>(
  items: T[],
  options: TradingVirtualScrollOptions = {}
): VirtualScrollReturn<T> & {
  isAutoScrolling: boolean;
  pauseAutoScroll: () => void;
  resumeAutoScroll: () => void;
} {
  const {
    itemHeight = 24, // Default height for trading rows
    containerHeight,
    stickyHeader = false,
    autoScrollToLatest = false,
    ...restOptions
  } = options;

  const [isAutoScrolling, setIsAutoScrolling] = useState(autoScrollToLatest);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const previousItemsLength = useRef(items.length);

  const virtualScroll = useVirtualScrolling(items, {
    itemHeight,
    containerHeight,
    ...restOptions,
  });

  // Auto-scroll to latest item when new items are added
  useEffect(() => {
    if (
      isAutoScrolling &&
      !userHasScrolled &&
      items.length > previousItemsLength.current &&
      items.length > 0
    ) {
      // Delay scroll to ensure DOM is updated
      setTimeout(() => {
        virtualScroll.scrollToIndex(items.length - 1, 'end');
      }, 0);
    }
    
    previousItemsLength.current = items.length;
  }, [items.length, isAutoScrolling, userHasScrolled, virtualScroll]);

  // Detect user scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    virtualScroll.scrollElementProps.onScroll(e);
    
    // If user scrolls up from the bottom, pause auto-scrolling
    const element = e.currentTarget;
    const isAtBottom = element.scrollTop >= element.scrollHeight - element.clientHeight - 50; // 50px threshold
    
    if (!isAtBottom && isAutoScrolling) {
      setUserHasScrolled(true);
      setIsAutoScrolling(false);
    }
  }, [virtualScroll.scrollElementProps.onScroll, isAutoScrolling]);

  const pauseAutoScroll = useCallback(() => {
    setIsAutoScrolling(false);
    setUserHasScrolled(true);
  }, []);

  const resumeAutoScroll = useCallback(() => {
    setIsAutoScrolling(true);
    setUserHasScrolled(false);
    // Immediately scroll to bottom
    if (items.length > 0) {
      virtualScroll.scrollToIndex(items.length - 1, 'end');
    }
  }, [items.length, virtualScroll]);

  return {
    ...virtualScroll,
    scrollElementProps: {
      ...virtualScroll.scrollElementProps,
      onScroll: handleScroll,
    },
    isAutoScrolling,
    pauseAutoScroll,
    resumeAutoScroll,
  };
}

// Hook for grid virtual scrolling (2D virtualization)
interface GridVirtualScrollOptions {
  rowHeight: number;
  columnWidth: number;
  containerWidth: number;
  containerHeight: number;
  overscanRows?: number;
  overscanColumns?: number;
}

interface GridVirtualScrollReturn<T> {
  virtualCells: Array<{
    rowIndex: number;
    columnIndex: number;
    item: T;
    style: React.CSSProperties;
  }>;
  totalWidth: number;
  totalHeight: number;
  scrollElementProps: {
    ref: React.RefObject<HTMLElement>;
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
  scrollToCell: (rowIndex: number, columnIndex: number) => void;
}

export function useGridVirtualScrolling<T>(
  items: T[][],
  options: GridVirtualScrollOptions
): GridVirtualScrollReturn<T> {
  const {
    rowHeight,
    columnWidth,
    containerWidth,
    containerHeight,
    overscanRows = 2,
    overscanColumns = 2,
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollElementRef = useRef<HTMLElement>(null);

  const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex, totalWidth, totalHeight } = useMemo(() => {
    const rowCount = items.length;
    const columnCount = items[0]?.length || 0;

    const visibleStartRow = Math.floor(scrollTop / rowHeight);
    const visibleEndRow = Math.min(
      visibleStartRow + Math.ceil(containerHeight / rowHeight),
      rowCount - 1
    );

    const visibleStartColumn = Math.floor(scrollLeft / columnWidth);
    const visibleEndColumn = Math.min(
      visibleStartColumn + Math.ceil(containerWidth / columnWidth),
      columnCount - 1
    );

    return {
      startRowIndex: Math.max(0, visibleStartRow - overscanRows),
      endRowIndex: Math.min(rowCount - 1, visibleEndRow + overscanRows),
      startColumnIndex: Math.max(0, visibleStartColumn - overscanColumns),
      endColumnIndex: Math.min(columnCount - 1, visibleEndColumn + overscanColumns),
      totalWidth: columnCount * columnWidth,
      totalHeight: rowCount * rowHeight,
    };
  }, [
    items.length,
    items[0]?.length,
    scrollTop,
    scrollLeft,
    rowHeight,
    columnWidth,
    containerHeight,
    containerWidth,
    overscanRows,
    overscanColumns,
  ]);

  const virtualCells = useMemo(() => {
    const result = [];
    for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
      for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex++) {
        const item = items[rowIndex]?.[columnIndex];
        if (item !== undefined) {
          result.push({
            rowIndex,
            columnIndex,
            item,
            style: {
              position: 'absolute' as const,
              top: rowIndex * rowHeight,
              left: columnIndex * columnWidth,
              width: columnWidth,
              height: rowHeight,
            },
          });
        }
      }
    }
    return result;
  }, [items, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex, rowHeight, columnWidth]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget;
    setScrollTop(element.scrollTop);
    setScrollLeft(element.scrollLeft);
  }, []);

  const scrollToCell = useCallback((rowIndex: number, columnIndex: number) => {
    if (!scrollElementRef.current) return;

    const element = scrollElementRef.current;
    const targetScrollTop = rowIndex * rowHeight;
    const targetScrollLeft = columnIndex * columnWidth;

    element.scrollTo({
      top: targetScrollTop,
      left: targetScrollLeft,
      behavior: 'smooth',
    });
  }, [rowHeight, columnWidth]);

  const scrollElementProps = {
    ref: scrollElementRef,
    onScroll: handleScroll,
    style: {
      width: containerWidth,
      height: containerHeight,
      overflow: 'auto',
      position: 'relative' as const,
    },
  };

  return {
    virtualCells,
    totalWidth,
    totalHeight,
    scrollElementProps,
    scrollToCell,
  };
}