#!/usr/bin/env perl

use utf8;
use strict;
use warnings;
use Time::HiRes qw(sleep);

use constant MIN_SLEEP => 1;
use constant MAX_SLEEP => 30;
use constant MAX_RETRY => 10;

my @command = @ARGV;
my $sleep = MIN_SLEEP;
my $retry = 0;

while(1) {
    my $exit = system(@command);
    if ($exit == 0) {
        # the command succeeds!
        exit 0;
    }

    print STDERR "the command exits with status code $exit\n";
    if ($retry >= MAX_RETRY) {
        print STDERR "give up :(\n";
        exit $exit;
    }

    print STDERR "sleep $sleep seconds before retrying\n";
    sleep($sleep + rand(1));

    $retry++;
    $sleep *= 2;
    $sleep = MAX_SLEEP if $sleep > MAX_SLEEP;
    print STDERR "retry $retry\n";
}
