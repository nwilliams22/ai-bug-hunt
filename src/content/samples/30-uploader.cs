using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace Storage
{
    public class Uploader
    {
        private static readonly HttpClient Http = new HttpClient();
        private readonly List<string> _uploaded = new List<string>();

        /// <summary>Uploads every path to the bucket and reports how many landed.</summary>
        public async void UploadAll(IEnumerable<string> paths, string bucket)
        {
            var tasks = new List<Task>();
            foreach (var path in paths)
            {
                tasks.Add(UploadOne(path, bucket));
            }

            await Task.WhenAll(tasks);
            Console.WriteLine($"Uploaded {_uploaded.Count} files");
        }

        private async Task UploadOne(string path, string bucket)
        {
            using (var stream = File.OpenRead(path))
            {
                var content = new StreamContent(stream);
                var url = $"https://{bucket}.example.com/{Path.GetFileName(path)}";
                var response = await Http.PutAsync(url, content);
                if (response.IsSuccessStatusCode)
                {
                    _uploaded.Add(path);
                }
            }
        }

        public string Manifest()
        {
            return string.Join("\n", _uploaded);
        }
    }
}
