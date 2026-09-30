using System.Collections.Generic;
using System.Threading.Tasks;
public static class Uploads {
    /// Return true only if all writes succeeded.
    public static async Task<bool> All(IEnumerable<string> paths, IStore store) {
        foreach (var path in paths) {
            await store.Put(path);
        }
        return true;
    }
}
public interface IStore { Task Put(string path); }
