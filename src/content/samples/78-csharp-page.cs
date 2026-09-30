using System;
using System.Collections.Generic;
public static class Paging {
    public static IReadOnlyList<T> Page<T>(IReadOnlyList<T> items, int offset, int limit) {
        if (offset < 0 || limit < 0) throw new ArgumentOutOfRangeException();
        var start = Math.Min(offset, items.Count);
        var count = Math.Min(limit, items.Count - start);
        var page = new List<T>(count);
        for (var i = 0; i < count; i++) page.Add(items[start + i]);
        return page;
    }
}
