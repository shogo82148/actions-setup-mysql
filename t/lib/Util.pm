package Util;

use strict;
use warnings;
use utf8;
use IPC::Open3;

use Exporter 'import';
our @EXPORT_OK = qw(run);

use Carp qw/croak/;

sub run {
    my @args = @_;
    my $pid = open3(my $in, my $out, 0, @args);
    close($in);
    my $result = do { local $/; <$out> };
    waitpid($pid, 0);
    if ($? != 0) {
        my $code = $? >> 8;
        my $cmd = join ' ', @args;
        croak "`$cmd` exit code: $code, message: $result";
    }
    return $result;
}

"NoSQL + SQL = MySQL"
