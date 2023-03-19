﻿using System.Security.AccessControl;

namespace BuildConfigGen
{
    internal class EnsureUpdateModeVerifier
    {
        // the goal of verification is to ensure the generation is up-to-date
        // if any changes would be made to output, verification should fail
        // check the contents of VerifyErrors for verification errors

        private readonly bool verifyOnly;
        private List<string> VerifyErrors = new List<string>();
        internal Dictionary<string, string> CopiedFilesToCheck = new Dictionary<string, string>();

        public IEnumerable<string> GetVerifyErrors()
        {
            foreach(var r in VerifyErrors)
            {
                yield return r;
            }

            foreach(var r in CopiedFilesToCheck)
            {
                if (Helpers.FilesEqual(r.Value, r.Key))
                {
                    // if overwrite and content match, everything is good!  Verification passed.
                }
                else
                {
                    yield return $"Need to copy {r.Value} to {r.Key} (overwrite=true).  Dest file doesn't match source.";
                }
            }
        }

        public FileVerifyChecker(bool verifyOnly)
        {
            this.verifyOnly = verifyOnly;
        }

        internal void Copy(string sourceFileName, string destFileName, bool overwrite)
        {
            if (verifyOnly)
            {
                if (File.Exists(destFileName))
                {
                    if (overwrite)
                    {
                        // we might check the content here, but we defer it in cause the content gets updated in WriteAllText
                        CopiedFilesToCheck.Add(NormalizeFile(destFileName), NormalizeFile(sourceFileName));
                    }
                    else
                    {
                        // similar exception we'd get if we invoked File.Copy with existing file and overwrite=false
                        throw new Exception($"destFileName={destFileName} exists and overwrite is false");
                    }
                }
                else
                {
                    VerifyErrors.Add($"Copy {sourceFileName} to {destFileName} (overwrite={overwrite}).  Dest file doesn't exist.");
                }
            }
            else
            {
                File.Copy(sourceFileName, destFileName, overwrite);
            }
        }

        internal void Move(string sourceFileName, string destFileName)
        {
            if (verifyOnly)
            {
                // verification won't pass if we encounter a move

                if (File.Exists(destFileName))
                {
                    // similar exception we'd get if we invoked File.Move with existing file
                    throw new Exception($"destFileName={destFileName} exists");
                }
                else
                {
                    VerifyErrors.Add($"Need to move {sourceFileName} to {destFileName}.  Dest file doesn't exist.");
                }
            }
            else
            {
                File.Move(sourceFileName, destFileName);
            }
        }

        internal void WriteAllText(string path, string contents)
        {
            if (verifyOnly)
            {
                if (File.Exists(path))
                {
                    string destContent = File.ReadAllText(path);

                    // we're checking the contents here, no need to check it later
                    string noramlizedPath = NormalizeFile(path);
                    if (CopiedFilesToCheck.ContainsKey(noramlizedPath))
                    {
                        CopiedFilesToCheck.Remove(noramlizedPath);
                    }

                    if (destContent == contents)
                    {
                        // content matches content in destination file.  Verification passes!
                    }
                    else
                    {
                        VerifyErrors.Add($"Need to write content to {path} content.Length={contents.Length}.  Existing content.Lenth={destContent.Length} needs update.");
                    }
                }
                else
                {
                    VerifyErrors.Add($"Need to write content to {path} content.Length={contents.Length}");
                }
            }
            else
            {
                File.WriteAllText(path, contents);
            }
        }

        private string NormalizeFile(string file)
        {
            FileInfo fi = new FileInfo(file);
            return fi.FullName;
        }
    }
}